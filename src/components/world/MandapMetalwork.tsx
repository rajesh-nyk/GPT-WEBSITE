import { useMemo } from 'react'
import { ExtrudeGeometry, LatheGeometry, Path, Shape, Vector2 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Turned brass bells, ribbed roof crowns and the pierced floral lintel share one draw.
function metalwork() {
  const pieces: ExtrudeGeometry[] = []
  const panel = new Shape()
  const edge = (x: number) => 2.94 - .14 * Math.sin(Math.PI * (x + 1.83) / 3.66) - .075 * Math.cos(x * 17)
  panel.moveTo(-1.83, 3.18)
  panel.lineTo(1.83, 3.18)
  for (let i = 96; i >= 0; i--) {
    const x = -1.83 + 3.66 * i / 96
    panel.lineTo(x, edge(x))
  }
  panel.closePath()
  for (let i = 0; i < 21; i++) {
    const x = (i - 10) * .17
    const aperture = new Path()
    aperture.moveTo(x, 2.97)
    aperture.bezierCurveTo(x - .082, 3.036, x - .052, 3.075, x, 3.13)
    aperture.bezierCurveTo(x + .052, 3.075, x + .082, 3.036, x, 2.97)
    panel.holes.push(aperture)
  }
  pieces.push(new ExtrudeGeometry(panel,{depth:.055,bevelThickness:.008,bevelSize:.008,bevelSegments:2}).translate(0,0,1.32))
  const turned = (profile: number[][], x: number, y: number, z: number, flutes=0) => {
    const mesh = new LatheGeometry(profile.map(([r,h])=>new Vector2(r,h)),48)
    const pos = mesh.attributes.position
    if(flutes) for(let i=0;i<pos.count;i++){
      const a=Math.atan2(pos.getX(i),pos.getZ(i))
      const k=1+.09*Math.cos(flutes*a)
      pos.setXYZ(i,pos.getX(i)*k,pos.getY(i),pos.getZ(i)*k)
    }
    mesh.computeVertexNormals()
    return mesh.translate(x,y,z).toNonIndexed()
  }
  const bell=[[.009,-.026],[.013,-.018],[.008,0],[.046,0],[.048,.009],[.039,.014],[.033,.029],[.022,.057],[.009,.062],[.007,.11]]
  const crown=[[.19,0],[.22,.025],[.18,.05],[.15,.07],[.19,.10],[.17,.17],[.09,.24],[.068,.25],[.08,.27],[.049,.29],[.022,.34],[.003,.4]]
  const ornaments = Array.from({length:21},(_,i)=>{
    const x=(i-10)*.17
    return turned(bell,x,edge(x)-.1,1.35)
  })
  for(const x of [-1.5,-.76,0,.76,1.5]){
    ornaments.push(turned(crown,x,3.94-Math.abs(x)*.32,0,12))
  }
  const parts=[...pieces,...ornaments]
  const result=mergeGeometries(parts)
  parts.forEach(g=>g.dispose())
  return result
}

export function MandapMetalwork(){
  const geometry=useMemo(metalwork,[])
  return <mesh geometry={geometry}><meshStandardMaterial color="#c39454" metalness={.66} roughness={.32}/></mesh>
}
