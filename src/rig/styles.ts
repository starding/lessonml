// Style packs (SPEC.md §7): the drawing rules a resource pack applies to every
// character. A lesson never names a style; swapping the pack restyles the
// whole world without touching one line of a screenplay.

export interface StylePack {
  id: string
  name: string
  nameZh: string
  description: string
  // Contour line on every shape, or none. 'auto' derives a dark tone of each fill.
  outline: { width: number; color: string | 'auto' } | null
  // How shadows are painted: opaque two-tone, translucent, or not at all.
  shading: 'cel' | 'soft' | 'none'
  eyes: 'anime' | 'oval' | 'dot'
  eyeScale: number
  face: 'anime' | 'round' | 'oval'
  nose: 'line' | 'hook' | 'none'
  browWidth: number
  blush: number
  hairShine: boolean
  gradients: boolean
  // Colour treatment applied to every base colour.
  saturation: number
  lightness: number
}

export const STYLE_PACKS: Record<string, StylePack> = {
  'anime-clean': {
    id: 'anime-clean',
    name: 'Anime clean line',
    nameZh: '日系清线',
    description: 'Large expressive eyes with highlights, thin contour lines, two-tone cel shading, hair shine.',
    outline: { width: 1.8, color: 'auto' },
    shading: 'cel',
    eyes: 'anime',
    eyeScale: 1.13,
    face: 'anime',
    nose: 'line',
    browWidth: 4.2,
    blush: 0.32,
    hairShine: true,
    gradients: true,
    saturation: 1,
    lightness: 0
  },
  'flat-modern': {
    id: 'flat-modern',
    name: 'Contemporary flat',
    nameZh: '当代扁平',
    description: 'No outlines, flat colour fields, one soft shadow, small oval eyes. Calm, editorial, adult.',
    outline: null,
    shading: 'soft',
    eyes: 'oval',
    eyeScale: 1,
    face: 'round',
    nose: 'none',
    browWidth: 3.4,
    blush: 0.22,
    hairShine: false,
    gradients: false,
    saturation: 0.82,
    lightness: 0.03
  },
  'ligne-claire': {
    id: 'ligne-claire',
    name: 'Ligne claire',
    nameZh: '欧式清线',
    description: 'One uniform black line on everything, flat bright colours, no shadows, dot eyes. Timeless comic clarity.',
    outline: { width: 2.6, color: '#1b1b1f' },
    shading: 'none',
    eyes: 'dot',
    eyeScale: 1,
    face: 'oval',
    nose: 'hook',
    browWidth: 3,
    blush: 0,
    hairShine: false,
    gradients: false,
    saturation: 1.08,
    lightness: 0.02
  }
}
