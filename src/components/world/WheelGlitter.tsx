import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, MathUtils, type Group } from 'three'
import { HERO_DIAMETER_UNITS } from '../hero/layout'
import { journey } from './journey'

export function rimLight(t: number) {
  return (.18 + .82 * MathUtils.smootherstep(t, .02, .24)) *
    (1 - MathUtils.smootherstep(t, .86, .96))
}

export function WheelGlitter() {
  const points = useRef<Group>(null)
  const origins = useMemo(() => {
    const values = new Float32Array(144 * 3)
    for (let i = 0; i < 144; i++) {
      const a = ((i * .618034) % 1 - .5) * 1.85 + (i % 2) * Math.PI
      values[i*3] = Math.cos(a) * HERO_DIAMETER_UNITS * .49
      values[i*3+1] = Math.sin(a) * HERO_DIAMETER_UNITS * .49
      values[i*3+2] = .3 + .05 * Math.sin(i * 2.4)
    }
    return values
  }, [])
  const uniforms = useMemo(() => ({time:{value:0}, strength:{value:0}, pixels:{value:1}}), [])
  useFrame(({gl}, dt) => {
    uniforms.strength.value = rimLight(journey.t)
    if (points.current) points.current.visible = uniforms.strength.value > .001
    uniforms.time.value += Math.min(dt,.05)
    uniforms.pixels.value = gl.getPixelRatio()
  })
  return <group ref={points}>
    <mesh position={[0,0,.28]} renderOrder={8}>
      <planeGeometry args={[2.5,2.5]}/>
      <shaderMaterial transparent depthTest={false} depthWrite={false} blending={AdditiveBlending} uniforms={uniforms}
        vertexShader={'varying vec2 vUvLocal;void main(){vUvLocal=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}'}
        fragmentShader={`varying vec2 vUvLocal;uniform float strength,time;
          void main(){
            float radius=length(vUvLocal);
            float d=abs(radius-.94);
            float rim=exp(-d*95.)*1.2+exp(-d*20.)*.55;
            float sides=.25+.75*pow(abs(vUvLocal.x)/max(radius,.001),2.);
            float pulse=.94+.06*sin(time*2.);
            gl_FragColor=vec4(1.,.63,.22,strength*rim*sides*pulse);
          }`}/>
    </mesh>
    <points frustumCulled={false} renderOrder={9}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[origins,3]}/></bufferGeometry>
    <shaderMaterial transparent depthTest={false} depthWrite={false} blending={AdditiveBlending} uniforms={uniforms}
      vertexShader={`uniform float time,strength,pixels; varying float light;
        void main(){
          float seed=fract(sin(dot(position.xy,vec2(53.1,91.7)))*4375.);
          float age=fract(seed+time*(.42+.32*seed));
          vec3 p=position;
          p.xy+=normalize(position.xy)*age*(.08+.48*seed);
          p.y+=age*age*.12;
          p.z+=age*(seed-.35)*.48;
          vec4 view=modelViewMatrix*vec4(p,1.);
          gl_Position=projectionMatrix*view;
          gl_PointSize=clamp((5.+seed*12.)*pixels*5./max(-view.z,.1),3.,26.);
          light=strength*smoothstep(0.,.14,age)*(1.-smoothstep(.28,1.,age));
        }`}
      fragmentShader={`varying float light;
        void main(){
          vec2 p=abs(gl_PointCoord*2.-1.);
          float halo=exp(-5.*dot(p,p));
          float core=exp(-32.*dot(p,p));
          float ray=exp(-24.*min(p.x,p.y))*pow(max(0.,1.-max(p.x,p.y)),3.);
          gl_FragColor=vec4(mix(vec3(1.,.53,.14),vec3(1.,.92,.65),core),light*(.23*halo+.8*core+.46*ray));
        }`}/>
    </points>
  </group>
}
