// The character rig (SPEC.md §7.2): one parametric bust, any number of
// characters, any style pack.
//
// A character is a handful of parameters (hair style, colours, outfit); every
// shade, every expression part and every style rule is derived. That is what
// keeps a world consistent when many people and models add characters.
//
// Output contract for runtimes: an SVG <g> in a 400×480 box with
//   .hb / .bd / .nk / .hf  groups (back hair, body, neck, head) for breathing and tilt,
//   .lock                  hair strands with data-pivot for sway,
//   [data-part][data-v]    swappable parts: eye (open|closed), brow and mouth
//                          (neutral|smile|stern|surprised|worried, mouth also talk).

import { grade, mix } from './color.js'
import type { StylePack } from './styles.js'

export const EXPRESSIONS = ['neutral', 'smile', 'stern', 'surprised', 'worried'] as const
export type Expression = (typeof EXPRESSIONS)[number]

export interface CharacterSpec {
  id: string
  hair: 'long' | 'bob' | 'short'
  outfit: 'blazer' | 'hoodie' | 'scrubs'
  glasses?: boolean
  colors: { skin: string; hair: string; eyes: string; cloth: string }
}

interface Palette {
  skin: string; skinLit: string; skinShade: string; nose: string; lip: string
  hair: string; hairHi: string; hairShade: string; brow: string; lash: string
  iris1: string; iris2: string; iris3: string
  cloth: string; clothShade: string; clothHi: string; shirt: string
}

const derivePalette = (spec: CharacterSpec, style: StylePack): Palette => {
  const g = (hex: string) => grade(hex, style.saturation, style.lightness)
  const skin = g(spec.colors.skin), hair = g(spec.colors.hair), eyes = g(spec.colors.eyes), cloth = g(spec.colors.cloth)
  return {
    skin,
    skinLit: mix(skin, '#ffffff', 0.3),
    skinShade: mix(skin, '#8a4a5a', 0.26),
    nose: mix(skin, '#6a3a30', 0.4),
    lip: mix(skin, '#8a2a3a', 0.55),
    hair,
    hairHi: mix(hair, '#c9b8ff', 0.28),
    hairShade: mix(hair, '#000000', 0.45),
    brow: mix(hair, '#000000', 0.25),
    lash: mix(hair, '#0b0710', 0.7),
    iris1: mix(eyes, '#000000', 0.62),
    iris2: eyes,
    iris3: mix(eyes, '#ffffff', 0.4),
    cloth,
    clothShade: mix(cloth, '#000000', 0.4),
    clothHi: mix(cloth, '#ffffff', 0.14),
    shirt: g('#f4f1ec')
  }
}

export function renderCharacter(spec: CharacterSpec, style: StylePack, idPrefix = 'lml'): string {
  const p = derivePalette(spec, style)
  const id = `${idPrefix}-${spec.id}-${style.id}`
  const line = (fill: string) => {
    if (!style.outline) return ''
    const color = style.outline.color === 'auto' ? mix(fill, '#140b18', 0.72) : style.outline.color
    return ` stroke="${color}" stroke-width="${style.outline.width}" stroke-linejoin="round"`
  }
  const fillOf = (flat: string, gradient: string) => (style.gradients ? `url(#${id}-${gradient})` : flat)
  const shape = (d: string, fill: string, outlineFrom = fill) => `<path d="${d}" fill="${fill}"${line(outlineFrom)}/>`
  const shadow = (d: string, color: string) => {
    if (style.shading === 'none') return ''
    return `<path d="${d}" fill="${color}" opacity="${style.shading === 'cel' ? 0.75 : 0.32}"/>`
  }

  // ── Face shape ──────────────────────────────────────────────────────────
  const faceD = {
    anime: 'M126 138 C124 212 146 258 176 286 C188 297 196 300 200 300 C204 300 212 297 224 286 C254 258 276 212 274 138 C274 70 126 70 126 138 Z',
    round: 'M126 146 C124 226 156 292 200 298 C244 292 276 226 274 146 C274 72 126 72 126 146 Z',
    oval: 'M132 144 C130 222 160 286 200 302 C240 286 270 222 268 144 C268 72 132 72 132 144 Z'
  }[style.face]

  // ── Eyes ────────────────────────────────────────────────────────────────
  const animeEye = (cx: number, cy: number, s: number) => {
    const inner = cx - s * 22, outer = cx + s * 26
    const white = `M${inner} ${cy - 2} Q${cx - s * 8} ${cy - 21} ${cx + s * 10} ${cy - 19} Q${cx + s * 24} ${cy - 15} ${outer} ${cy - 3} Q${cx + s * 16} ${cy + 16} ${cx} ${cy + 15} Q${cx - s * 16} ${cy + 13} ${inner} ${cy - 2} Z`
    const clip = `${id}-eye${s}`
    return {
      open: `<clipPath id="${clip}"><path d="${white}"/></clipPath>
        <path d="${white}" fill="#fffaf6"/>
        <g clip-path="url(#${clip})">
          <ellipse cx="${cx}" cy="${cy + 1}" rx="14.5" ry="18.5" fill="${style.gradients ? `url(#${id}-iris)` : p.iris2}"/>
          <ellipse cx="${cx}" cy="${cy + 3}" rx="6.5" ry="9" fill="${p.iris1}"/>
          <path d="${white}" fill="none" stroke="${p.skinShade}" stroke-width="7" opacity=".35" transform="translate(0,-4)"/>
          <circle cx="${cx - 6}" cy="${cy - 7}" r="5.2" fill="#fff"/><circle cx="${cx + 5}" cy="${cy + 9}" r="2.3" fill="#fff" opacity=".85"/>
        </g>
        <path d="M${inner} ${cy - 2} Q${cx - s * 8} ${cy - 23} ${cx + s * 10} ${cy - 21} Q${cx + s * 24} ${cy - 17} ${outer} ${cy - 3}" fill="none" stroke="${p.lash}" stroke-width="4.4" stroke-linecap="round"/>
        <path d="M${outer} ${cy - 3} L${outer + s * 7} ${cy - 10}" stroke="${p.lash}" stroke-width="3" stroke-linecap="round"/>`,
      closed: `<path d="M${inner} ${cy + 1} Q${cx} ${cy + 11} ${outer} ${cy}" fill="none" stroke="${p.lash}" stroke-width="3.8" stroke-linecap="round"/>`
    }
  }
  const ovalEye = (cx: number, cy: number, s: number) => ({
    open: `<ellipse cx="${cx}" cy="${cy + 2}" rx="8.5" ry="11" fill="${mix(p.iris1, '#1a1420', 0.5)}"/><circle cx="${cx - 3}" cy="${cy - 2}" r="2.6" fill="#fff"/>
      <path d="M${cx - s * 6} ${cy - 13} Q${cx + s * 6} ${cy - 15} ${cx + s * 14} ${cy - 9}" fill="none" stroke="${p.lash}" stroke-width="2.6" stroke-linecap="round"/>`,
    closed: `<path d="M${cx - 10} ${cy + 3} Q${cx} ${cy + 10} ${cx + 10} ${cy + 3}" fill="none" stroke="${p.lash}" stroke-width="3" stroke-linecap="round"/>`
  })
  const dotEye = (cx: number, cy: number) => ({
    open: `<ellipse cx="${cx}" cy="${cy + 2}" rx="5" ry="6.5" fill="#1b1b1f"/>`,
    closed: `<path d="M${cx - 7} ${cy + 3} Q${cx} ${cy + 7} ${cx + 7} ${cy + 3}" fill="none" stroke="#1b1b1f" stroke-width="2.6" stroke-linecap="round"/>`
  })
  const eye = (cx: number, cy: number, s: number) => {
    const parts = style.eyes === 'anime' ? animeEye(cx, cy, s) : style.eyes === 'oval' ? ovalEye(cx, cy, s) : dotEye(cx, cy)
    const scale = `transform="translate(${cx} ${cy}) scale(${style.eyeScale}) translate(${-cx} ${-cy})"`
    return `<g ${scale} data-part="eye" data-v="open">${parts.open}</g><g ${scale} data-part="eye" data-v="closed" style="display:none">${parts.closed}</g>`
  }

  // ── Brows and mouths ────────────────────────────────────────────────────
  const browY: Record<Expression, number[]> = { neutral: [-33, -40, -35], smile: [-35, -42, -37], stern: [-27, -34, -38], surprised: [-42, -50, -44], worried: [-41, -37, -31] }
  const brow = (cx: number, cy: number, s: number, v: Expression) => `M${cx - s * 18} ${cy + browY[v][0]} Q${cx + s * 3} ${cy + browY[v][1]} ${cx + s * 23} ${cy + browY[v][2]}`
  const brows = EXPRESSIONS.map((v) => `<g data-part="brow" data-v="${v}"${v === 'neutral' ? '' : ' style="display:none"'} fill="none" stroke="${p.brow}" stroke-width="${style.browWidth}" stroke-linecap="round"><path d="${brow(164, 196, -1, v)}"/><path d="${brow(236, 196, 1, v)}"/></g>`).join('')
  const mouthStroke = `fill="none" stroke="${style.outline?.color === '#1b1b1f' ? '#1b1b1f' : p.lip}" stroke-width="2.7" stroke-linecap="round"`
  const mouthShapes: Record<string, string> = {
    neutral: `<path d="M190 257 Q200 260 210 257" ${mouthStroke}/>`,
    smile: `<path d="M186 252 Q200 266 214 252" ${mouthStroke}/>`,
    stern: `<path d="M187 259 Q200 255 213 259" ${mouthStroke}/>`,
    worried: `<path d="M189 260 Q195 255 200 257 Q205 255 211 260" ${mouthStroke}/>`,
    surprised: `<ellipse cx="200" cy="259" rx="6" ry="8" fill="#5e2430"${line('#5e2430')}/>`,
    talk: `<path d="M190 253 Q200 250 210 253 Q207 267 200 267 Q193 267 190 253 Z" fill="#5e2430"${line('#5e2430')}/>`
  }
  const mouths = Object.entries(mouthShapes).map(([v, d]) => `<g data-part="mouth" data-v="${v}"${v === 'neutral' ? '' : ' style="display:none"'}>${d}</g>`).join('')
  const nose = style.nose === 'line'
    ? `<path d="M203 216 Q207 227 199 231" fill="none" stroke="${p.nose}" stroke-width="2.2" stroke-linecap="round"/>`
    : style.nose === 'hook'
      ? `<path d="M200 212 Q212 230 200 234" fill="none" stroke="#1b1b1f" stroke-width="2.4" stroke-linecap="round"/>`
      : ''

  // ── Hair ────────────────────────────────────────────────────────────────
  const hairFill = fillOf(p.hair, 'hair')
  const hair = {
    long: {
      back: 'M116 118 C88 200 84 340 94 476 L306 476 C316 340 312 200 284 118 Z',
      locks: [
        ['120 140', 'M116 138 C100 200 102 280 116 352 C126 318 134 268 140 224 C142 190 138 160 130 140 Z'],
        ['280 140', 'M284 138 C300 200 298 280 284 352 C274 318 266 268 260 224 C258 190 262 160 270 140 Z']
      ],
      front: 'M110 154 C100 70 158 32 204 34 C258 36 302 76 292 160 C284 130 270 106 250 92 C256 122 248 142 236 156 C232 126 220 104 202 96 C192 120 176 142 148 160 C158 134 160 114 156 98 C136 112 120 134 110 154 Z'
    },
    bob: {
      back: 'M120 120 C100 190 104 286 126 322 L274 322 C296 286 300 190 280 120 Z',
      locks: [
        ['118 150', 'M114 150 C102 216 108 282 134 318 C138 284 142 244 144 204 Z'],
        ['282 150', 'M286 150 C298 216 292 282 266 318 C262 284 258 244 256 204 Z']
      ],
      front: 'M114 164 C98 72 160 34 204 34 C260 34 304 76 288 164 L272 150 L260 168 L246 146 L230 166 L216 142 L200 162 L186 140 L172 164 L158 144 L144 166 L130 148 Z'
    },
    short: {
      back: 'M122 132 C116 170 120 200 128 214 L272 214 C280 200 284 170 278 132 Z',
      locks: [] as string[][],
      front: 'M116 168 C100 84 156 40 206 40 C262 42 304 86 286 168 C280 140 268 118 248 108 C236 124 206 132 170 126 C150 134 128 148 116 168 Z'
    }
  }[spec.hair]
  const shine = style.hairShine
    ? `<path d="M146 82 C172 64 230 62 258 84" fill="none" stroke="${p.hairHi}" stroke-width="7" stroke-linecap="round" stroke-dasharray="20 9 30 12" opacity=".55"/>`
    : ''

  // ── Outfit ──────────────────────────────────────────────────────────────
  const clothFill = fillOf(p.cloth, 'cloth')
  const bodyD = 'M14 480 C26 410 80 380 150 364 L176 338 L224 338 L250 364 C320 380 374 410 386 480 Z'
  const outfit = {
    blazer: `${shape(bodyD, clothFill, p.cloth)}
      ${shape('M170 342 L200 414 L230 342 Z', p.shirt)}
      ${shape('M150 364 L178 340 L200 432 L166 404 Z', p.clothHi, p.cloth)}${shape('M250 364 L222 340 L200 432 L234 404 Z', p.clothHi, p.cloth)}`,
    hoodie: `${shape(bodyD, clothFill, p.cloth)}
      ${shape('M136 366 C150 330 250 330 264 366 C244 352 156 352 136 366 Z', p.clothHi, p.cloth)}
      <path d="M182 360 L178 420 M218 360 L222 420" stroke="${mix(p.cloth, '#ffffff', 0.7)}" stroke-width="2.6" stroke-linecap="round"/>`,
    scrubs: `${shape(bodyD, clothFill, p.cloth)}
      ${shape('M172 340 L200 392 L228 340 L220 338 L200 374 L180 338 Z', p.clothShade, p.cloth)}
      ${shape('M262 410 L312 410 L312 450 L262 450 Z', p.clothHi, p.cloth)}
      <path d="M272 400 L272 426" stroke="#e5484d" stroke-width="4" stroke-linecap="round"/>`
  }[spec.outfit]
  const bodyShadow = shadow('M250 364 C320 380 374 410 386 480 L300 480 C300 430 280 392 250 364 Z', p.clothShade)

  const glasses = spec.glasses ? `
    <g fill="rgba(210,228,255,.07)" stroke="${style.outline?.color === '#1b1b1f' ? '#1b1b1f' : '#2c2840'}" stroke-width="2.4">
      <rect x="133" y="171" width="62" height="46" rx="15"/><rect x="205" y="171" width="62" height="46" rx="15"/>
      <path d="M195 190 Q200 186 205 190" fill="none"/></g>
    ${style.shading !== 'none' ? '<path d="M142 206 L158 176 M214 206 L230 176" stroke="#fff" stroke-width="2" opacity=".25"/>' : ''}` : ''

  const defs = style.gradients ? `<defs>
    <linearGradient id="${id}-iris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.iris1}"/><stop offset=".6" stop-color="${p.iris2}"/><stop offset="1" stop-color="${p.iris3}"/></linearGradient>
    <linearGradient id="${id}-hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.hairHi}"/><stop offset=".35" stop-color="${p.hair}"/><stop offset="1" stop-color="${p.hairShade}"/></linearGradient>
    <linearGradient id="${id}-cloth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.cloth}"/><stop offset="1" stop-color="${p.clothShade}"/></linearGradient>
    <linearGradient id="${id}-skin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${p.skinLit}"/><stop offset=".55" stop-color="${p.skin}"/><stop offset="1" stop-color="${p.skin}"/></linearGradient>
  </defs>` : ''

  return `<g data-character="${spec.id}" data-style="${style.id}">${defs}
    <g class="hb">${shape(hair.back, style.shading === 'none' ? p.hair : p.hairShade, p.hair)}</g>
    <g class="bd">${outfit}${bodyShadow}</g>
    <g class="nk">${shape('M178 262 L222 262 L226 346 C212 356 188 356 174 346 Z', p.skin)}${shadow('M178 262 L222 262 L222 296 C208 308 192 308 178 296 Z', p.skinShade)}</g>
    <g class="hf">
      ${shape('M118 182 C110 182 110 214 120 216 Z', p.skin)}${shape('M282 182 C290 182 290 214 280 216 Z', p.skin)}
      ${shape(faceD, fillOf(p.skin, 'skin'), p.skin)}
      ${shadow('M264 150 C264 214 246 254 220 284 C240 262 254 230 258 196 Z', p.skinShade)}
      ${shadow('M132 150 C162 176 240 176 270 150 L270 166 C240 190 160 190 132 166 Z', p.skinShade)}
      ${style.blush ? `<ellipse cx="156" cy="234" rx="16" ry="6.5" fill="#f08a8a" opacity="${style.blush}"/><ellipse cx="244" cy="234" rx="16" ry="6.5" fill="#f08a8a" opacity="${style.blush}"/>` : ''}
      ${nose}${eye(164, 196, -1)}${eye(236, 196, 1)}${brows}${mouths}${glasses}
      ${hair.locks.map(([pivot, d]) => `<g class="lock" data-pivot="${pivot}">${shape(d, hairFill, p.hair)}</g>`).join('')}
      ${shape(hair.front, hairFill, p.hair)}${shine}
    </g>
  </g>`
}

// ── "Character creator": a new, style-consistent character from a seed ────
const SKINS = ['#f6dccb', '#ecc4a6', '#d9a47f', '#b9805c', '#8d5a3e', '#f3d4c0']
const HAIRS = ['#231a2c', '#3b2a22', '#7a3424', '#a8743e', '#d8c08a', '#4a4f5c', '#151318']
const EYES = ['#7a4a2a', '#4f8a72', '#3d6a9a', '#5a4a3a', '#8a6a3a', '#6a5a8a']
const CLOTHS = ['#3a3f5c', '#33456a', '#2f6f73', '#7a3b4a', '#4a5a3a', '#5c4a72', '#c26a3a']

export const generateCharacter = (seed: number, id = `c${seed}`): CharacterSpec => {
  let state = (seed * 2654435761) % 2147483647 || 1
  const next = () => (state = (state * 16807) % 2147483647) / 2147483647
  const pick = <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)]
  return {
    id,
    hair: pick(['long', 'bob', 'short'] as const),
    outfit: pick(['blazer', 'hoodie', 'scrubs'] as const),
    glasses: next() < 0.3,
    colors: { skin: pick(SKINS), hair: pick(HAIRS), eyes: pick(EYES), cloth: pick(CLOTHS) }
  }
}
