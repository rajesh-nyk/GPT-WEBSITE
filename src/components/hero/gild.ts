import { Color, FrontSide, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three'

/**
 * "Gilds" the wheel. The source texture is a warm brown (carved sandstone look), so
 * tinting it would only give bronze. Instead the shader keeps the texture's *brightness*
 * — every carved horse, spoke and lotus — and maps it onto a gold ramp: deep antique
 * gold in recesses → bright yellow-gold on raised surfaces. On standard (PBR) materials
 * it also becomes fully metallic so the environment's light cards reflect as gold gleam.
 * Works for the low-tier Lambert material too (same map_fragment chunk).
 */
const SHADOW_GOLD = new Color('#4f2c07')
const LIGHT_GOLD = new Color('#ffdf8c')

export function gild(root: Object3D) {
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach(gildMaterial)
  })
}

function gildMaterial(material: Material) {
  const m = material as MeshStandardMaterial
  if (!m.map) return
  m.color.set('#ffffff')
  // The export is flagged double-sided, but the wheel is a closed solid: back faces are
  // never visible. Culling them halves rasterisation work on a dense mesh.
  m.side = FrontSide
  if (m.isMeshStandardMaterial) {
    m.metalness = 1
    m.roughness = 0.5 // multiplies the roughness map: a touch glossier than the scan
    m.envMapIntensity = 1.5
    // The scan's normal map is subtle (it holds the finest relief: beads, scales,
    // filigree). Strengthen it so that relief catches light and reads at a distance.
    if (m.normalMap) m.normalScale.set(1.8, 1.8)
  }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGoldDark = { value: SHADOW_GOLD }
    shader.uniforms.uGoldLight = { value: LIGHT_GOLD }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 uGoldDark;\nuniform vec3 uGoldLight;\nvoid main() {',
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          float lum = dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
          // Gentle curve over the texture's full range (no hard clip), so tonal
          // differences between carved layers survive instead of flattening to one gold.
          float g = pow( clamp( lum / 0.55, 0.0, 1.0 ), 0.8 );
          diffuseColor.rgb *= mix( uGoldDark, uGoldLight, g );
        #endif
        `,
      )
  }
  m.customProgramCacheKey = () => 'gilded'
  m.needsUpdate = true
}
