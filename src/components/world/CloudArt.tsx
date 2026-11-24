/** Hand-shaped SVG cloud volumes. The soft mask defines the outline; the gradients
 * build internal light and shadow without a raster texture or animated SVG filter.
 * Each instance has unique IDs so all clouds can coexist in one document.
 */
const FORMS = [
  'M-28 240 C-4 188 44 174 88 179 C95 129 137 108 181 121 C192 79 237 43 287 53 C326 21 394 46 415 94 C467 79 513 112 524 149 C580 137 634 177 648 229 C675 244 684 276 670 307 L-35 307 Z',
  'M-35 245 C-9 194 35 182 73 187 C102 145 142 139 177 149 C189 104 224 74 265 82 C303 36 365 28 407 76 C448 71 495 100 508 139 C568 132 610 165 630 200 C664 201 694 239 680 303 L-35 307 Z',
  'M-35 243 C-1 209 26 188 79 194 C104 151 136 130 188 142 C208 103 247 89 282 103 C314 53 362 48 409 81 C447 56 491 84 513 119 C566 112 612 156 618 191 C662 192 684 242 676 307 L-35 307 Z',
] as const

export function CloudArt({ id, variant = 0 }: { id: string; variant?: number }) {
  const contour = FORMS[variant % FORMS.length]
  return (
    <svg viewBox="0 0 640 320" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id={id + '-body'} x1="0" y1="0" x2="0.14" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".31" stopColor="#f6f8fd" />
          <stop offset=".65" stopColor="#d4dce9" />
          <stop offset="1" stopColor="#aab8d0" />
        </linearGradient>
        <radialGradient id={id + '-light'} cx=".46" cy=".31" r=".64">
          <stop stopColor="#ffffff" />
          <stop offset=".49" stopColor="#ffffff" stopOpacity=".86" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id + '-shade'} cx=".5" cy=".5" r=".5">
          <stop stopColor="#a4b3cf" stopOpacity=".48" />
          <stop offset=".63" stopColor="#c4cee0" stopOpacity=".24" />
          <stop offset="1" stopColor="#d9e0ed" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id + '-tail'} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".53" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={id + '-soft'} x="-8%" y="-12%" width="116%" height="124%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <mask id={id + '-outline'} maskUnits="userSpaceOnUse" x="-50" y="-20" width="740" height="360">
          <path d={contour} fill="#fff" filter={'url(#' + id + '-soft)'} />
        </mask>
        <mask id={id + '-fade'} maskUnits="userSpaceOnUse" x="-50" y="0" width="740" height="320">
          <rect x="-50" width="740" height="320" fill={'url(#' + id + '-tail)'} />
        </mask>
      </defs>
      <g mask={'url(#' + id + '-fade)'}>
        <g mask={'url(#' + id + '-outline)'}>
          <path d={contour} fill={'url(#' + id + '-body)'} />
          {/* Irregular light lobes, not a stack of circular outlines. */}
          <path d="M-46 215 C21 156 60 153 113 173 C116 115 182 85 236 114 C263 151 241 211 195 238 C128 276 16 266 -46 215Z" fill={'url(#' + id + '-light)'} />
          <path d="M136 145 C155 84 201 28 276 27 C348 7 421 38 433 101 C438 151 407 181 365 188 C302 216 222 206 136 145Z" fill={'url(#' + id + '-light)'} />
          <path d="M323 141 C365 91 438 72 487 99 C543 113 574 166 550 201 C522 230 417 247 355 219 C309 196 309 165 323 141Z" fill={'url(#' + id + '-light)'} />
          <path d="M448 185 C487 150 567 139 627 178 C682 211 687 267 621 287 C571 290 490 264 448 185Z" fill={'url(#' + id + '-light)'} />
          <path d="M28 225 C129 206 193 220 254 262 C279 287 249 319 154 323 C69 319 13 287 28 225Z" fill={'url(#' + id + '-shade)'} />
          <path d="M225 177 C268 145 334 161 377 193 C413 216 401 265 345 272 C276 277 216 236 225 177Z" fill={'url(#' + id + '-shade)'} />
          <path d="M399 245 C449 205 517 206 583 231 C633 254 607 302 535 315 C468 325 411 290 399 245Z" fill={'url(#' + id + '-shade)'} />
        </g>
      </g>
    </svg>
  )
}
