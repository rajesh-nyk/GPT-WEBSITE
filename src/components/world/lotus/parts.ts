import { BufferGeometry, type BufferAttribute } from 'three'

/** Separate the tagged triangles while sharing the original vertex buffers. */
export function splitByPart(geometry: BufferGeometry, part: BufferAttribute): [BufferGeometry, BufferGeometry] {
  const index = geometry.getIndex()!.array
  const uv = geometry.getAttribute('uv')
  const lotus: number[] = []
  const figure: number[] = []
  for (let i = 0; i < index.length; i += 3) {
    const vertex = index[i]
    const u = uv.getX(vertex)
    const v = uv.getY(vertex)
    // Both baked variants mislabel this red waist-sash island as a lotus petal.
    const waistSash = u >= 0.5935 && u <= 0.6402 && v >= 0.207 && v <= 0.2431
    const triangles = part.getX(vertex) > 0.5 || waistSash ? figure : lotus
    triangles.push(vertex, index[i + 1], index[i + 2])
  }
  const make = (triangles: number[]) => {
    const result = new BufferGeometry()
    for (const name of ['position', 'normal', 'uv']) result.setAttribute(name, geometry.getAttribute(name))
    result.setIndex(triangles)
    result.computeBoundingSphere()
    return result
  }
  return [make(lotus), make(figure)]
}
