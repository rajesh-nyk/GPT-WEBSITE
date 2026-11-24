import { Suspense, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment, Lightformer, useGLTF, useTexture } from '@react-three/drei'
import { useQuality } from '../../lib/quality'
import { resolveModelFile, variantIsUltra } from '../../lib/models'
import { Box3, CatmullRomCurve3, Matrix4, MathUtils, PerspectiveCamera, SRGBColorSpace, Vector3 } from 'three'
import { JourneyDirector, journey } from './journey'
import { useReducedMotion } from '../../lib/useReducedMotion'

function Sculpture({ file, height }: { file: string; height: number }) {
  const { assetTier } = useQuality()
  const variant = resolveModelFile(file, variantIsUltra(assetTier === 'high'))
  const { scene } = useGLTF(import.meta.env.BASE_URL + 'models/' + variant, import.meta.env.BASE_URL + 'draco/')
  const object = useMemo(() => {
    const model = scene.clone(true)
    const bounds = new Box3().setFromObject(model)
    const center = bounds.getCenter(new Vector3())
    const scale = height / bounds.getSize(new Vector3()).y
    model.scale.multiplyScalar(scale)
    model.position.sub(new Vector3(center.x, bounds.min.y, center.z).multiplyScalar(scale))
    return model
  }, [scene, height])
  return <primitive object={object} />
}

const route = new CatmullRomCurve3([[0,.05,8],[-.9,.05,4],[.6,.05,1],[1.4,.05,-1],[1,.05,-4]].map(p=>new Vector3(...p)))
const cameraPath = new CatmullRomCurve3([[0,1.9,7],[-.8,1.8,5.9],[-.5,1.65,4.6],[.45,1.5,3],[1,1.45,1.1]].map(p=>new Vector3(...p)))

function Pavilion() {
  return <group position={[1, -.1, -4]}>
    <group rotation={[0, -.18, 0]}>
      <Sculpture file="mandap.glb" height={3.65}/>
    </group>
    <group position={[0, .5, .05]}>
      <Sculpture file="lotus-ganesha.glb" height={1.48}/>
    </group>
  </group>
}

function Valley(){
  const horizon=useTexture(import.meta.env.BASE_URL+'threshold-courtyard.webp')
  horizon.colorSpace=SRGBColorSpace
  const motes=useMemo(()=>Float32Array.from({length:450},(_,i)=>{
    const v=Math.sin(i*78.233+2)*43758.5453
    const n=v-Math.floor(v)
    return i%3===0?(n-.5)*24:i%3===1?n*5:-n*16
  }),[])
  return <>
    <mesh position={[-.43,-1.47,-25]}><planeGeometry args={[36.1,20.4]}/><meshBasicMaterial map={horizon} fog={false} toneMapped={false}/></mesh>
    <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[motes,3]}/></bufferGeometry><pointsMaterial color="#f8dfab" size={.023} transparent opacity={.72} depthWrite={false}/></points>
  </>
}

function Pond(){
  const courtyard=useTexture(import.meta.env.BASE_URL+'threshold-courtyard.webp')
  const uniforms=useMemo(()=>{
    const view=new PerspectiveCamera(35,16/9,.1,50)
    view.position.set(0,1.9,7)
    view.lookAt(-.15,.75,-4)
    view.updateMatrixWorld()
    return {uTime:{value:0},uTravel:{value:0},uScene:{value:courtyard},uProject:{value:new Matrix4().multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse)}}
  },[courtyard])
  const reduced=useReducedMotion()
  useFrame((_,dt)=>{
    if(!reduced) uniforms.uTime.value+=Math.min(dt,.05)
    uniforms.uTravel.value=Math.min(journey.t,1)
  })
  return <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.11,-2]}>
    <planeGeometry args={[48,42]}/>
    <shaderMaterial uniforms={uniforms} transparent depthWrite={false}
      vertexShader={'varying vec3 point;void main(){vec4 p=modelMatrix*vec4(position,1.);point=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}'}
      fragmentShader={`varying vec3 point;uniform float uTime,uTravel;uniform sampler2D uScene;uniform mat4 uProject;
        void main(){
          vec2 p=point.xz;
          float ripple=sin(p.y*32.+sin(p.x*5.+uTime)*1.4+uTime*1.7);
          float streak=exp(-abs(p.x-1.+.22*sin(p.y*5.+uTime))*(2.+.6*sin(p.y)));
          float glint=pow(max(0.,ripple),6.)*streak;
          float wake=exp(-abs(p.y-(6.-uTravel*10.))*.9);
          vec4 projected=uProject*vec4(point,1.);
          vec2 uv=projected.xy/projected.w*.5+.5;
          uv.x+=ripple*.00065;
          vec3 water=texture2D(uScene,clamp(uv,.001,.999)).rgb+vec3(.25,.18,.1)*glint*(.55+.45*wake);
          float mist=.04*(1.+sin(p.x*.8+p.y*.5+uTime*.2));
          gl_FragColor=vec4(water+vec3(.38,.31,.47)*mist,.85*smoothstep(-19.,-6.,p.y));
          #include <colorspace_fragment>
        }`}/>
  </mesh>
}

export function ThresholdScene() {
  const reduced = useReducedMotion()
  useFrame(({camera,size})=>{
    const narrow=size.width<size.height
    const t=reduced ? Number(journey.target>=1) : MathUtils.smootherstep(journey.t,0,1.65)
    cameraPath.getPointAt(t,camera.position)
    camera.position.z+=narrow?2.4:0
    camera.lookAt(MathUtils.lerp(narrow?.85:-.15,1,t),MathUtils.lerp(narrow?.4:.75,1.12,t),-4)
  })
  return <>
    <JourneyDirector reducedMotion={reduced}/>
    <Environment frames={1} resolution={64} environmentIntensity={.55}>
      <Lightformer position={[-4,5,4]} target={[0,0,0]} scale={[4,2,1]} intensity={2.8} color="#ffce91"/>
      <Lightformer position={[4,3,-3]} target={[0,0,0]} scale={[2,5,1]} intensity={2} color="#b8cfff"/>
    </Environment>
    <fogExp2 attach="fog" args={['#45445b',.033]}/>
    <hemisphereLight args={['#a7b8da','#533f3a',.94]}/>
    <directionalLight position={[-4,7,1]} intensity={1.8} color="#ffe0ae"/>
    <pointLight position={[1,2,-2.2]} color="#ffbd69" intensity={22}/>
    <Suspense fallback={null}><Valley/></Suspense>
    <group position={[2.6,-.15,2.4]} rotation={[0,-.75,0]}><Suspense fallback={null}><Sculpture file="dharma-wheel.glb" height={3.35}/></Suspense></group>
    <Pavilion/>
    <Pond/>
    {Array.from({length:12},(_,i)=>{
      const point=route.getPointAt(i/12)
      return <group key={i} scale={.48} position={[point.x+(i%2?1:-1)*(1.95+.45*Math.sin(i)),.01,point.z]}>
        {Array.from({length:7},(_,n)=><group key={n} rotation={[0,n*Math.PI*2/7,0]}><mesh position={[0,.065,.1]} rotation={[.9,0,0]} scale={[.06,.14,.045]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#e5abcc" emissive="#713754"/></mesh></group>)}
      </group>
    })}
  </>
}
