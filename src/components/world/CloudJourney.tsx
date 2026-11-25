import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Data3DTexture, LinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType, ShaderMaterial, Scene, OrthographicCamera, Mesh, PlaneGeometry, WebGLRenderTarget, Vector2, Vector4, Color, GLSL3, NormalBlending, NoBlending } from 'three'
import { ScrollTrigger } from '../../lib/gsap'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { heroFx } from '../hero/fx'
import { glowCenters } from './screenShapes'

// Shared, deterministic low-memory turbulence. No image assets or video.
function noiseVolume(){
  const size=64, data=new Uint8Array(size*size*size*4)
  const hash=(x:number,y:number,z:number)=>{
    let n=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(z,1442695041)
    n=Math.imul(n^(n>>>13),1274126177)
    return ((n^(n>>>16))>>>0)/4294967295
  }
  const grids=[4,8,16,32].map(n=>{
    const a=new Float32Array(n*n*n)
    for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++)a[(z*n+y)*n+x]=hash(x+19,y+31,z+47+n)
    return {n,a}
  })
  function value(g:{n:number;a:Float32Array},x:number,y:number,z:number){
    const {n,a}=g
    const ix=Math.floor(x*n),iy=Math.floor(y*n),iz=Math.floor(z*n)
    let fx=x*n-ix,fy=y*n-iy,fz=z*n-iz
    fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);fz=fz*fz*(3-2*fz)
    const get=(dx:number,dy:number,dz:number)=>a[(((iz+dz)%n)*n+(iy+dy)%n)*n+(ix+dx)%n]
    const mix=(a:number,b:number,t:number)=>a+(b-a)*t
    return mix(mix(mix(get(0,0,0),get(1,0,0),fx),mix(get(0,1,0),get(1,1,0),fx),fy),mix(mix(get(0,0,1),get(1,0,1),fx),mix(get(0,1,1),get(1,1,1),fx),fy),fz)
  }
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const a=value(grids[0],x/size,y/size,z/size),b=value(grids[1],x/size,y/size,z/size)
    const c=value(grids[2],x/size,y/size,z/size),d=value(grids[3],x/size,y/size,z/size)
    const i=((z*size+y)*size+x)*4
    data[i]=255*(a*.58+b*.26+c*.11+d*.05)
    data[i+1]=255*(b*.55+c*.30+d*.15)
    data[i+2]=255*(c*.65+d*.35)
    data[i+3]=255
  }
  return {size,data}
}

let baked: ReturnType<typeof noiseVolume> | undefined
function makeNoise(){
  const {size,data}=baked ??= noiseVolume()
  const tex=new Data3DTexture(data,size,size,size)
  tex.format=RGBAFormat
  tex.type=UnsignedByteType
  tex.minFilter=tex.magFilter=LinearFilter
  tex.wrapS=tex.wrapT=tex.wrapR=RepeatWrapping
  tex.unpackAlignment=1
  tex.needsUpdate=true
  return tex
}
const quad=`
  varying vec2 vUv;
  void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}
`
const volume=`
precision highp sampler3D;
uniform sampler3D uNoise;
uniform vec2 uBounds;
uniform float uAspect,uProgress,uTime,uWheelLight;
uniform vec2 uSunCenter;
varying vec2 vUv;
out vec4 cloudColor;
const vec3 moon=vec3(-.55,.78,.30);

// Separate near cumulus, mid-level billows and distant cirrus. Large-scale
// weather and smaller erosion use the same 1MiB procedural 3D lookup.
float density(vec3 p){
  vec3 q=p+vec3(uTime*.023,0.,uTime*.012);
  vec3 coarse=texture(uNoise,q*vec3(.048,.075,.048)).rgb;
  float h=(p.y+.9)/6.7;
  if(h<=0.||h>=1.)return 0.;
  float profile=smoothstep(0.,.13,h)*(1.-smoothstep(.58+coarse.r*.22,1.,h));
  float cover=smoothstep(.29,.62,coarse.r);
  vec3 detail=texture(uNoise,q*.19+vec3(.23,.41,.07)).rgb;
  float billow=coarse.r*.76+detail.r*.24;
  float erosion=(1.-detail.b)*.09;
  float cumulus=clamp((billow-.52+profile*.15-erosion)*5.5,0.,1.)*profile*cover;
  // Thin mid-level wisps occupy real vertical/depth bands, not screen planes.
  float middle=exp(-pow((p.y-3.7)*.85,2.))*smoothstep(.53,.73,detail.g)*.18;
  float high=exp(-pow((p.y-5.1)*2.3,2.))*smoothstep(.56,.78,coarse.g)*.15;
  return clamp(cumulus+middle+high,0.,1.);
}
float shadow(vec3 p,float local){
  float tau=local*.20+density(p+moon*.48)*.48+density(p+moon*1.7)*1.2;
  return exp(-tau*2.6);
}
void main(){
  vec2 uv=vec2(vUv.x,mix(uBounds.x,uBounds.y,vUv.y));
  float p=uProgress;
  float flight=p*p*(3.-2.*p);
  vec2 xy=(uv-.5)*vec2(uAspect,1.);
  // Camera traverses real world-space depth. Both chapters sample this
  // exact camera and field in viewport coordinates.
  vec3 ro=vec3(.25*sin(flight*1.8),5.7-3.1*sin(flight*1.65),-5.+flight*13.);
  vec3 rd=normalize(vec3(xy.x,xy.y-.32,1.12));
  float mask=mix(1.-smoothstep(.09,.22,uv.y),1.,smoothstep(.05,.67,p));
  if(mask<.002){cloudColor=vec4(0.);return;}
  float t0=0.,t1=28.;
  if(abs(rd.y)>.0001){
    float a=(-.9-ro.y)/rd.y,b=(5.8-ro.y)/rd.y;
    t0=max(t0,min(a,b));t1=min(t1,max(a,b));
  }else if(ro.y<-.9||ro.y>5.8){cloudColor=vec4(0.);return;}
  if(t1<=t0){cloudColor=vec4(0.);return;}
  float stride=max(.11,(t1-t0)/48.);
  // Stable screen-space jitter breaks up marching bands without frame flicker.
  float jitter=fract(52.9829189*fract(dot(uv*vec2(911.,613.),vec2(.06711056,.00583715))));
  float t=t0+jitter*stride;
  vec3 sum=vec3(0.);float trans=1.;
  float phase=.75+.45*pow(max(0.,dot(rd,moon)),4.);
  float wheelHalo=exp(-length((uv-uSunCenter)*vec2(uAspect,1.))*3.4)*uWheelLight;
  for(int i=0;i<48;i++){
    if(t>=t1||trans<.017)break;
    vec3 pos=ro+rd*t;
    float d=density(pos);
    if(d>.006){
      float lit=shadow(pos,d);
      float a=1.-exp(-d*stride*3.0);
      float height=clamp((pos.y+.9)/6.7,0.,1.);
      vec3 ambient=mix(vec3(.035,.055,.105),vec3(.19,.25,.39),height);
      vec3 silver=vec3(.67,.76,.91)*lit*phase;
      // Wheel's existing golden sun acts as a gentle warm atmospheric source.
      vec3 gold=vec3(.58,.31,.09)*wheelHalo*(.22+.78*lit)*exp(-t*.045);
      vec3 air=mix(ambient+silver+gold,vec3(.13,.16,.26),1.-exp(-t*.012));
      sum+=trans*a*air;
      trans*=1.-a;
    }
    t+=stride;
  }
  float alpha=1.-trans;
  if(alpha<.0001){cloudColor=vec4(0.);return;}
  // Store straight linear RGB with alpha in the small intermediate target.
  cloudColor=vec4(sum/max(alpha,.0001),alpha*mask*mix(.48,1.,smoothstep(.05,.55,p)));
}
`
const compositeVertex=`
  varying vec2 vUv;
  void main(){vUv=uv;gl_Position=vec4(position.xy,.9997,1.);}
`
const compositeFragment=`
  uniform sampler2D uCloud;
  uniform vec2 uBounds;
  uniform vec2 uCanvasY;
  uniform float uTargetFraction;
  varying vec2 vUv;
  void main(){
    float y=uCanvasY.x+vUv.y*uCanvasY.y;
    if(y<uBounds.x||y>uBounds.y)discard;
    vec4 c=texture2D(uCloud,vec2(vUv.x,(y-uBounds.x)/max(.0001,uBounds.y-uBounds.x)*uTargetFraction));
    if(c.a<.002)discard;
    gl_FragColor=c;
    #include <colorspace_fragment>
  }
`

/** Both existing R3F scenes use the same world-space cloud field, no third
 * WebGL context. March only a reduced-resolution, visible vertical strip,
 * then composite with the full-resolution sky/wheel and existing bloom. */
export function CloudJourney(){
  const gl=useThree(s=>s.gl)
  const reduced=useReducedMotion()
  const geometry=useRef({top:0,height:0,hero:1})
  const res=useMemo(()=>{
    const noise=makeNoise()
    const target=new WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false,minFilter:LinearFilter,magFilter:LinearFilter})
    const bounds=new Vector2(0,1)
    const cloud=new ShaderMaterial({
      glslVersion:GLSL3,vertexShader:quad.replace('varying','out'),
      fragmentShader:volume.replace('varying','in'),
      depthTest:false,depthWrite:false,blending:NoBlending,toneMapped:false,
      uniforms:{uNoise:{value:noise},uBounds:{value:bounds},uAspect:{value:1},
        uProgress:{value:0},uTime:{value:0},uWheelLight:{value:0},uSunCenter:{value:new Vector2(.5,.6)}}
    })
    const plane=new PlaneGeometry(2,2)
    const pass=new Mesh(plane,cloud);pass.frustumCulled=false
    const scene=new Scene();scene.add(pass)
    const camera=new OrthographicCamera(-1,1,1,-1,0,1)
    const material=new ShaderMaterial({
      vertexShader:compositeVertex,fragmentShader:compositeFragment,
      transparent:true,depthTest:true,depthWrite:false,blending:NormalBlending,toneMapped:false,
      uniforms:{uCloud:{value:target.texture},uBounds:{value:bounds},uCanvasY:{value:new Vector2(0,1)},uTargetFraction:{value:1}}
    })
    return {noise,target,bounds,cloud,plane,scene,camera,material,viewport:new Vector4(),scissor:new Vector4(),clear:new Color()}
  },[])
  const last=useRef({p:-1,lo:-1,hi:-1,w:0,h:0,time:-Infinity})
  useEffect(()=>{
    const hero=document.getElementById('hero')
    const canvas=gl.domElement
    const measure=()=>{
      const r=canvas.getBoundingClientRect()
      geometry.current={top:r.top+window.scrollY,height:r.height,hero:hero?.offsetHeight||window.innerHeight}
      last.current.p=-1
    }
    const observer=new ResizeObserver(measure)
    observer.observe(canvas);if(hero)observer.observe(hero)
    ScrollTrigger.addEventListener('refresh',measure)
    measure()
    return ()=>{
      observer.disconnect();ScrollTrigger.removeEventListener('refresh',measure)
    }
  },[gl])
  useEffect(()=>()=>{res.target.dispose();res.noise.dispose();res.cloud.dispose();res.material.dispose();res.plane.dispose()},[res])

  useFrame(()=>{
    const g=geometry.current,vh=Math.max(1,window.innerHeight),vw=Math.max(1,window.innerWidth)
    if(g.height<=0)return
    const y=window.scrollY,p=Math.max(0,Math.min(1,y/g.hero))
    const bottom=1-(g.top-y+g.height)/vh
    const top=bottom+g.height/vh
    const maskTop=.23+.77*Math.min(1,Math.max(0,(p-.05)/.62))
    const lo=Math.max(0,bottom),hi=Math.min(1,top,p<.05?maskTop:1)
    res.material.visible=hi-lo>.001
    if(!res.material.visible)return
    res.material.uniforms.uCanvasY.value.set(bottom,g.height/vh)
    // Quarter-ish pixel workload compared with the existing Ultra canvases.
    const factor=Math.min(.65,1050/vw)
    const w=Math.max(1,Math.round(vw*factor)),h=Math.max(1,Math.round(vh*factor))
    const activeH=Math.max(1,Math.min(h,Math.ceil(h*(hi-lo))))
    const time=performance.now()/1000
    const old=last.current
    if(p===old.p&&lo===old.lo&&hi===old.hi&&w===old.w&&h===old.h&&(reduced||time-old.time<1/24))return
    if(w!==old.w||h!==old.h)res.target.setSize(w,h)
    // Keep the allocation fixed through scroll; only its active viewport shrinks.
    res.target.viewport.set(0,0,w,activeH)
    res.material.uniforms.uTargetFraction.value=activeH/h
    res.bounds.set(lo,hi)
    const u=res.cloud.uniforms
    u.uAspect.value=vw/vh;u.uProgress.value=p;u.uTime.value=reduced?0:time
    u.uWheelLight.value=(1-p)*heroFx.rise*(.75+.25*heroFx.breath)
    u.uSunCenter.value.set(glowCenters.sun[0],1-(g.hero*(1-glowCenters.sun[1])-y)/vh)
    // Isolate the offscreen render from the existing scissor and composer state.
    const previous=gl.getRenderTarget(),scissorTest=gl.getScissorTest(),alpha=gl.getClearAlpha(),autoClear=gl.autoClear
    gl.getViewport(res.viewport);gl.getScissor(res.scissor);gl.getClearColor(res.clear)
    try{
      gl.setRenderTarget(res.target);gl.setScissorTest(false)
      gl.setClearColor(0,0);gl.autoClear=true
      gl.render(res.scene,res.camera)
    }finally{
      gl.setRenderTarget(previous);gl.setViewport(res.viewport);gl.setScissor(res.scissor)
      gl.setScissorTest(scissorTest);gl.setClearColor(res.clear,alpha);gl.autoClear=autoClear
    }
    old.p=p;old.lo=lo;old.hi=hi;old.w=w;old.h=h;old.time=time
  },-1)

  return <mesh renderOrder={-997} frustumCulled={false} geometry={res.plane} material={res.material} />
}
