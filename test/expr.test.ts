import assert from 'node:assert/strict'
import test from 'node:test'
import { ExprError, evaluate, formatNumber, makeScope, namesIn, parseExpr } from '../src/expr.js'

const run = (source: string, scope: Record<string, number> = {}) => evaluate(parseExpr(source), (name) => {
  if (name in scope) return scope[name]
  throw new Error(`unknown ${name}`)
})

test('arithmetic, precedence and associativity', () => {
  assert.equal(run('1 + 2 * 3'), 7)
  assert.equal(run('(1 + 2) * 3'), 9)
  assert.equal(run('2 ^ 3 ^ 2'), 512, '^ is right-associative')
  assert.equal(run('-2 ^ 2'), -4, 'unary minus binds looser than ^')
  assert.equal(run('10 - 4 - 3'), 3, '- is left-associative')
  assert.equal(run('7 % 4'), 3)
})

test('names with dots, constants, functions, comparisons and logic', () => {
  assert.equal(run('trust.priya + 1', { 'trust.priya': 2 }), 3)
  assert.ok(Math.abs(run('2 * pi') - 2 * Math.PI) < 1e-12)
  assert.equal(run('round(1234.5678, 2)'), 1234.57)
  assert.equal(run('max(1, 5, 3)'), 5)
  assert.equal(run('3 > 2 && !(1 > 2)'), 1)
  assert.equal(run('0.1 + 0.2 == 0.3'), 1, 'equality tolerates float noise')
})

test('formulas resolve through state, on demand', () => {
  const scope = makeScope({ principal: 1000, rate: 0.05, years: 10 }, { balance: 'principal * (1 + rate) ^ years', gain: 'balance - principal' })
  assert.equal(Math.round(scope.evaluate('balance')), 1629)
  assert.equal(Math.round(scope.evaluate('gain')), 629)
})

test('errors say where, and nothing but math is reachable', () => {
  assert.throws(() => parseExpr('1 +'), (error: unknown) => error instanceof ExprError && /ends too early/.test(error.message))
  assert.throws(() => parseExpr('2 * (3'), /expected "\)"/)
  assert.throws(() => parseExpr('"text"'), /unexpected/)
  assert.throws(() => parseExpr('a = 1'), /unexpected "="/)
  assert.throws(() => parseExpr('x[0]'), /unexpected "\["/)
  assert.deepEqual([...namesIn(parseExpr('principal * (1 + rate) ^ years'))].sort(), ['principal', 'rate', 'years'])
})

test('numbers read naturally in text', () => {
  assert.equal(formatNumber(1628.894626777442), '1,628.89')
  assert.equal(formatNumber(2000), '2,000')
  assert.equal(formatNumber(Infinity), '—')
})
