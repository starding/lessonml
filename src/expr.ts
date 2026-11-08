// Safe expressions over lesson state (SPEC.md §3.6).
//
// Formulas, conditions, live text, numeric answers and simulation goals are
// all written in this one small language: numbers, names, arithmetic,
// comparisons, boolean logic and a fixed set of math functions. There is no
// member access, no strings, no assignment and no way to reach the host:
// a model writing a lesson can describe a simulation without writing code.

export type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'name'; name: string }
  | { kind: 'unary'; op: '-' | '!'; arg: Expr }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'call'; fn: string; args: Expr[] }

export class ExprError extends Error {
  constructor(message: string, readonly position: number) { super(message) }
}

export const FUNCTIONS: Record<string, { arity: [number, number]; fn: (...args: number[]) => number }> = {
  abs: { arity: [1, 1], fn: Math.abs },
  sqrt: { arity: [1, 1], fn: Math.sqrt },
  exp: { arity: [1, 1], fn: Math.exp },
  ln: { arity: [1, 1], fn: Math.log },
  log10: { arity: [1, 1], fn: Math.log10 },
  sin: { arity: [1, 1], fn: Math.sin },
  cos: { arity: [1, 1], fn: Math.cos },
  tan: { arity: [1, 1], fn: Math.tan },
  floor: { arity: [1, 1], fn: Math.floor },
  ceil: { arity: [1, 1], fn: Math.ceil },
  round: { arity: [1, 2], fn: (x, digits = 0) => { const k = 10 ** digits; return Math.round(x * k) / k } },
  min: { arity: [1, 8], fn: Math.min },
  max: { arity: [1, 8], fn: Math.max },
  pow: { arity: [2, 2], fn: Math.pow },
  clamp: { arity: [3, 3], fn: (x, lo, hi) => Math.min(hi, Math.max(lo, x)) }
}
export const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, g: 9.81 }

type Token = { type: 'num' | 'name' | 'op' | 'end'; value: string; at: number }

const tokenize = (source: string): Token[] => {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const c = source[i]
    if (/\s/.test(c)) { i++; continue }
    const num = source.slice(i).match(/^(\d+(\.\d+)?|\.\d+)(e[+-]?\d+)?/i)
    if (num) { tokens.push({ type: 'num', value: num[0], at: i }); i += num[0].length; continue }
    const name = source.slice(i).match(/^[A-Za-z_][\w.]*/)
    if (name) { tokens.push({ type: 'name', value: name[0], at: i }); i += name[0].length; continue }
    const op = source.slice(i).match(/^(>=|<=|==|!=|&&|\|\||[-+*/%^()<>!,])/)
    if (op) { tokens.push({ type: 'op', value: op[0], at: i }); i += op[0].length; continue }
    throw new ExprError(`unexpected "${c}"`, i)
  }
  tokens.push({ type: 'end', value: '', at: source.length })
  return tokens
}

// Precedence climbing. ^ is right-associative and binds tighter than unary minus on its left (-2^2 = -4).
const BINARY: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 8 }

export function parseExpr(source: string): Expr {
  const tokens = tokenize(source)
  let p = 0
  const peek = () => tokens[p]
  const take = () => tokens[p++]
  const expect = (value: string) => {
    const token = take()
    if (token.value !== value) throw new ExprError(`expected "${value}"${token.type === 'end' ? ' before the end' : ` but found "${token.value}"`}`, token.at)
  }
  const primary = (): Expr => {
    const token = take()
    if (token.type === 'num') return { kind: 'num', value: Number(token.value) }
    if (token.type === 'name') {
      if (peek().value === '(') {
        take()
        const args: Expr[] = []
        if (peek().value !== ')') {
          do { args.push(binary(0)) } while (peek().value === ',' && take())
        }
        expect(')')
        return { kind: 'call', fn: token.value, args }
      }
      return { kind: 'name', name: token.value }
    }
    if (token.value === '(') {
      const inner = binary(0)
      expect(')')
      return inner
    }
    if (token.value === '-' || token.value === '!') return { kind: 'unary', op: token.value, arg: unary() }
    throw new ExprError(token.type === 'end' ? 'the expression ends too early' : `unexpected "${token.value}"`, token.at)
  }
  const unary = (): Expr => {
    if (peek().value === '-' || peek().value === '!') {
      const op = take().value as '-' | '!'
      return { kind: 'unary', op, arg: unary() }
    }
    return power()
  }
  const power = (): Expr => {
    const base = primary()
    if (peek().value === '^') {
      take()
      return { kind: 'binary', op: '^', left: base, right: unary() }
    }
    return base
  }
  const binary = (min: number): Expr => {
    let left = unary()
    for (;;) {
      const op = peek().value
      const precedence = peek().type === 'op' ? BINARY[op] : undefined
      if (precedence === undefined || op === '^' || precedence < min) return left
      take()
      left = { kind: 'binary', op, left, right: binary(precedence + 1) }
    }
  }
  const tree = binary(0)
  if (peek().type !== 'end') throw new ExprError(`unexpected "${peek().value}"`, peek().at)
  return tree
}

export const namesIn = (expr: Expr, out = new Set<string>()): Set<string> => {
  if (expr.kind === 'name') out.add(expr.name)
  else if (expr.kind === 'unary') namesIn(expr.arg, out)
  else if (expr.kind === 'binary') { namesIn(expr.left, out); namesIn(expr.right, out) }
  else if (expr.kind === 'call') expr.args.forEach((arg) => namesIn(arg, out))
  return out
}

export const callsIn = (expr: Expr, out: Array<{ fn: string; count: number }> = []) => {
  if (expr.kind === 'call') { out.push({ fn: expr.fn, count: expr.args.length }); expr.args.forEach((arg) => callsIn(arg, out)) }
  else if (expr.kind === 'unary') callsIn(expr.arg, out)
  else if (expr.kind === 'binary') { callsIn(expr.left, out); callsIn(expr.right, out) }
  return out
}

export type Lookup = (name: string) => number

export function evaluate(expr: Expr, lookup: Lookup): number {
  switch (expr.kind) {
    case 'num': return expr.value
    case 'name': return expr.name in CONSTANTS ? CONSTANTS[expr.name] : lookup(expr.name)
    case 'unary': {
      const value = evaluate(expr.arg, lookup)
      return expr.op === '-' ? -value : value ? 0 : 1
    }
    case 'call': {
      const fn = FUNCTIONS[expr.fn]
      if (!fn) throw new ExprError(`unknown function ${expr.fn}`, 0)
      return fn.fn(...expr.args.map((arg) => evaluate(arg, lookup)))
    }
    case 'binary': {
      if (expr.op === '&&') return evaluate(expr.left, lookup) && evaluate(expr.right, lookup) ? 1 : 0
      if (expr.op === '||') return evaluate(expr.left, lookup) || evaluate(expr.right, lookup) ? 1 : 0
      const a = evaluate(expr.left, lookup), b = evaluate(expr.right, lookup)
      switch (expr.op) {
        case '+': return a + b
        case '-': return a - b
        case '*': return a * b
        case '/': return a / b
        case '%': return a % b
        case '^': return a ** b
        case '<': return a < b ? 1 : 0
        case '>': return a > b ? 1 : 0
        case '<=': return a <= b ? 1 : 0
        case '>=': return a >= b ? 1 : 0
        case '==': return Math.abs(a - b) < 1e-9 ? 1 : 0
        default: return Math.abs(a - b) >= 1e-9 ? 1 : 0
      }
    }
  }
}

// State + formulas → a lookup. Formulas are evaluated on demand; cycles are rejected at compile time.
export const makeScope = (state: Record<string, number>, formulas: Record<string, string>, cache = new Map<string, Expr>()) => {
  const parsed = (source: string) => {
    let tree = cache.get(source)
    if (!tree) { tree = parseExpr(source); cache.set(source, tree) }
    return tree
  }
  const lookup: Lookup = (name) => {
    if (name in state) return state[name]
    if (name in formulas) return evaluate(parsed(formulas[name]), lookup)
    throw new ExprError(`unknown name ${name}`, 0)
  }
  return { lookup, evaluate: (source: string) => evaluate(parsed(source), lookup) }
}

// How live values read in text: integers as is, others to two places.
export const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return '—'
  if (Number.isInteger(value)) return value.toLocaleString('en-US')
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

// "{=balance}" inside text. Target-word marks "{word}" are untouched.
export const INTERPOLATION = /\{=([^}]+)\}/g
