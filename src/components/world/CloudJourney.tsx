import { useEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '../../lib/gsap'
import { useReducedMotion } from '../../lib/useReducedMotion'

// Real 3D volume, not a billboard or a stretched 2D cloud texture. The
// raymarch integrates optical density and light attenuation along each ray.
const vertex = `#version 300 es
precision highp float;
const vec2 pos[3] = vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
void main(){gl_Position=vec4(pos[gl_VertexID],0.,1.);}`
const fragment = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler3D uNoise;
uniform vec2 uResolution;
uniform float uProgress;
uniform float uTime;
out vec4 frag;
const vec3 sun=vec3(-.58,.77,.27);

float density(vec3 p){
  vec3 q=p+vec3(uTime*.018,0.,uTime*.011);
  // Vary the cloud floor and the heights of the rounded cumulus crowns.
  float cover=texture(uNoise,vec3(q.x*.039,.17,q.z*.039)).r;
  float floorY=-.8+cover*.8;
  float topY=1.3+cover*5.4;
  float h=(p.y-floorY)/(topY-floorY);
  if(h<=0.||h>=1.)return 0.;
  float profile=smoothstep(0.,.15,h)*(1.-smoothstep(.57,1.,h));
  vec3 n=texture(uNoise,q*.085).rgb;
  float mass=n.r*.72+n.g*.28;
  float erode=texture(uNoise,q*.32).b;
  float d=mass-(.61-.22*profile)-.12*(1.-erode);
  return clamp(d*4.2,0.,1.)*profile;
}
float lightAt(vec3 p){
  // Beer-Lambert transmittance from the sun through the cloud itself.
  float tau=0.;
  tau+=density(p+sun*.25)*.25;
  tau+=density(p+sun*.85)*.60;
  tau+=density(p+sun*1.9)*1.05;
  tau+=density(p+sun*3.8)*1.9;
  return exp(-tau*2.2);
}
void main(){
  vec2 uv=gl_FragCoord.xy/uResolution;
  vec2 xy=(gl_FragCoord.xy-.5*uResolution)/uResolution.y;
  float p=uProgress;
  float flight=smoothstep(0.,1.,p);
  // Descend into the cloud bank, then climb out while advancing in depth.
  vec3 ro=vec3(0.,5.4-2.9*sin(flight*2.30),-4.+flight*10.5);
  vec3 rd=normalize(vec3(xy.x,xy.y-.36,1.12));
  float mask=mix(1.-smoothstep(.09,.23,uv.y),1.,smoothstep(.04,.55,p));
  if(mask<.002){frag=vec4(0.);return;}
  float t0=0.,t1=25.;
  if(abs(rd.y)>.0001){
    float a=(-.9-ro.y)/rd.y,b=(6.8-ro.y)/rd.y;
    t0=max(t0,min(a,b));t1=min(t1,max(a,b));
  }else if(ro.y<-.9||ro.y>6.8){frag=vec4(0.);return;}
  if(t1<=t0){frag=vec4(0.);return;}
  float stepLen=clamp((t1-t0)/64.,.085,.42);
  float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
  float t=t0+stepLen*jitter;
  vec3 sum=vec3(0.);float trans=1.;
  float scatter=.88+.25*pow(max(0.,dot(rd,sun)),6.);
  for(int i=0;i<80;i++){
    if(t>=t1||trans<.012)break;
    vec3 point=ro+rd*t;
    float d=density(point);
    if(d>.006){
      float direct=lightAt(point);
      float a=1.-exp(-d*stepLen*2.8);
      vec3 ambient=mix(vec3(.075,.093,.145),vec3(.24,.28,.38),clamp((point.y+1.)/5.5,0.,1.));
      vec3 light=ambient+vec3(.63,.57,.53)*direct*scatter;
      sum+=trans*a*light;
      trans*=1.-a;
    }
    t+=stepLen;
  }
  float alpha=1.-trans;
  if(alpha<.0001){frag=vec4(0.);return;}
  vec3 color=pow(clamp(sum/alpha,0.,1.),vec3(.90));
  alpha*=mask*mix(.62,1.,smoothstep(.08,.55,p));
  // Premultiplied transparency lets the existing galaxy show through gaps.
  frag=vec4(color*alpha,alpha);
}`

// Bake a tileable 3D turbulence texture once. This makes density lookups
// much cheaper than recomputing multiple octaves of noise per ray step.
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
function makeRenderer(canvas:HTMLCanvasElement){
  const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,powerPreference:'high-performance'})
  if(!gl)return null
  const program=gl.createProgram()
  if(!program)return null
  for(const [type,src] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){
    const s=gl.createShader(type)
    if(!s){gl.deleteProgram(program);return null}
    gl.shaderSource(s,src);gl.compileShader(s)
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
      console.error('[cloud] shader:',gl.getShaderInfoLog(s));gl.deleteShader(s);gl.deleteProgram(program);return null
    }
    gl.attachShader(program,s);gl.deleteShader(s)
  }
  gl.linkProgram(program)
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
    console.error('[cloud] link:',gl.getProgramInfoLog(program));gl.deleteProgram(program);return null
  }
  gl.useProgram(program)
  const tex=gl.createTexture()
  const vao=gl.createVertexArray()
  if(!tex||!vao){gl.deleteTexture(tex);gl.deleteVertexArray(vao);gl.deleteProgram(program);return null}
  gl.bindVertexArray(vao)
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,tex)
  const {size,data}=noiseVolume()
  gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,size,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,data)
  for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,axis,gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)
  const resolution=gl.getUniformLocation(program,'uResolution')
  const progress=gl.getUniformLocation(program,'uProgress')
  const time=gl.getUniformLocation(program,'uTime')
  gl.uniform1i(gl.getUniformLocation(program,'uNoise'),0)
  return {
    draw(p:number,t:number){
      if(gl.isContextLost())return
      gl.viewport(0,0,canvas.width,canvas.height)
      gl.uniform2f(resolution,canvas.width,canvas.height)
      gl.uniform1f(progress,p);gl.uniform1f(time,t)
      gl.drawArrays(gl.TRIANGLES,0,3)
    },
    dispose(){gl.deleteTexture(tex);gl.deleteVertexArray(vao);gl.deleteProgram(program)}
  }
}

/** Shared cloud volume over both chapter panels. The cloud camera is driven by
 * actual scroll position, so forward/reverse motion uses the same 3D space. */
export function CloudJourney(){
  const host=useRef<HTMLDivElement>(null)
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const reducedMotion=useReducedMotion()
  useEffect(()=>{
    const el=host.current,canvas=canvasRef.current,hero=document.getElementById('hero')
    if(!el||!canvas||!hero)return
    let renderer=makeRenderer(canvas)
    let height=hero.offsetHeight,lastP=-1,lastDraw=-Infinity
    let lost=false
    const start=performance.now()
    const measure=()=>{
      height=hero.offsetHeight
      // Cap the experimental cloud buffer only; all approved 3D canvases
      // retain their original Ultra DPR and postprocessing.
      const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight)
      const scale=Math.min(window.devicePixelRatio||1,1,960/Math.max(w,h))
      canvas.width=Math.max(1,Math.round(w*scale))
      canvas.height=Math.max(1,Math.round(h*scale))
      lastP=-1
    }
    const tick=()=>{
      if(!renderer||lost||document.hidden||height<=0)return
      const now=performance.now(),p=Math.max(0,Math.min(1,window.scrollY/height))
      const changed=p!==lastP
      // During scroll the camera follows each frame. At rest, limit the
      // slowly drifting volume to 30Hz and avoid all work in reduced motion.
      if(!changed&&(reducedMotion||now-lastDraw<33))return
      renderer.draw(p,reducedMotion?0:(now-start)/1000)
      lastP=p;lastDraw=now;el.style.opacity='1'
    }
    const onLost=(event:Event)=>{event.preventDefault();lost=true;el.style.opacity='0'}
    const onRestored=()=>{renderer=makeRenderer(canvas);lost=false;lastP=-1;tick()}
    canvas.addEventListener('webglcontextlost',onLost)
    canvas.addEventListener('webglcontextrestored',onRestored)
    const observer=new ResizeObserver(measure)
    observer.observe(hero);observer.observe(el)
    ScrollTrigger.addEventListener('refresh',measure)
    measure();tick();gsap.ticker.add(tick)
    return ()=>{
      gsap.ticker.remove(tick);observer.disconnect()
      ScrollTrigger.removeEventListener('refresh',measure)
      canvas.removeEventListener('webglcontextlost',onLost)
      canvas.removeEventListener('webglcontextrestored',onRestored)
      renderer?.dispose()
    }
  },[reducedMotion])
  return <div className="cloud-journey" ref={host} aria-hidden="true"><canvas ref={canvasRef} className="cloud-journey__volume" /></div>
}
