// Small colour helpers: a character is a few base colours, every shade is derived.

const toRgb = (hex: string): [number, number, number] => {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`

export const mix = (a: string, b: string, t: number) => {
  const [x, y] = [toRgb(a), toRgb(b)]
  return toHex(x.map((v, i) => v + (y[i] - v) * t))
}

// Scale saturation and shift lightness, for a style's colour treatment.
export const grade = (hex: string, saturation = 1, lightness = 0) => {
  const [r, g, b] = toRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  s = Math.max(0, Math.min(1, s * saturation))
  const L = Math.max(0, Math.min(1, l + lightness))
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  if (s === 0) return toHex([L * 255, L * 255, L * 255])
  const q = L < 0.5 ? L * (1 + s) : L + s - L * s
  const p = 2 * L - q
  return toHex([hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)].map((v) => v * 255))
}
