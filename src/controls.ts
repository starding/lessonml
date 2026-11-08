// "rate 0.01..0.12 step 0.01, years 1..30 step 1" — the sliders of a lessonml:explore.

export interface Control { name: string; min: number; max: number; step: number }

export const parseControls = (source: string): { controls: Control[]; errors: string[] } => {
  const controls: Control[] = []
  const errors: string[] = []
  for (const part of source.split(',').map((piece) => piece.trim()).filter(Boolean)) {
    const match = part.match(/^([A-Za-z_][\w.]*)\s+(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)(?:\s+step\s+([\d.]+))?$/)
    if (!match) { errors.push(`cannot read control "${part}"; write "<state> <min>..<max> step <step>"`); continue }
    const [, name, min, max, step] = match
    const control = { name, min: Number(min), max: Number(max), step: step ? Number(step) : (Number(max) - Number(min)) / 100 }
    if (!(control.max > control.min) || !(control.step > 0)) errors.push(`control ${name}: needs min < max and a positive step`)
    controls.push(control)
  }
  return { controls, errors }
}

export const snap = (control: Control, value: number) => {
  const steps = Math.round((Math.min(control.max, Math.max(control.min, value)) - control.min) / control.step)
  return Number((control.min + steps * control.step).toFixed(10))
}

// "1%" = within 1 percent of the answer; "0.5" = within ±0.5.
export const withinTolerance = (value: number, expected: number, tolerance = '0.5%') => {
  const relative = tolerance.trim().endsWith('%')
  const amount = Number(tolerance.replace('%', ''))
  return Math.abs(value - expected) <= (relative ? Math.abs(expected) * amount / 100 : amount) + 1e-9
}

// "$1,629", "1629 USD", "9.8 m/s^2" → number and unit.
export const parseNumericAnswer = (input: string): { value: number; unit: string } | null => {
  const match = input.trim().replace(/^[$€¥£]/, '').match(/^([-+]?(?:\d{1,3}(?:,\d{3})+|\d*)(?:\.\d+)?(?:e[-+]?\d+)?)\s*(.*)$/i)
  if (!match || !match[1] || match[1] === '-' || match[1] === '+') return null
  const value = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(value) ? { value, unit: match[2].trim() } : null
}
