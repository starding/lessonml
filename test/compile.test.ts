import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { compile, describeWorld, formatDiagnostics, parseScreenplay, type World } from '../src/index.js'

const world = JSON.parse(fs.readFileSync('examples/harbor/world.json', 'utf8')) as World
const episode = fs.readFileSync('examples/harbor/compliance-call.lml', 'utf8')

test('the example episode compiles cleanly', () => {
  const result = compile(episode, world)
  assert.equal(formatDiagnostics(result.diagnostics), '')
  assert.equal(result.lesson.id, 'harbor:compliance-call')
  assert.deepEqual(result.lesson.state, { 'trust.priya': 0 })
})

test('lines resolve speakers to world ids and keep translations and target words', () => {
  const { lesson } = compile(episode, world)
  const steps = lesson.scenes[0].steps
  const first = steps.find((step) => step.kind === 'line')
  assert.ok(first && first.kind === 'line')
  assert.equal(first.speaker, 'harbor:priya')
  assert.equal(first.expression, 'neutral')
  assert.match(first.translation || '', /合规部/)
  const third = steps.filter((step) => step.kind === 'line')[2]
  assert.ok(third.kind === 'line')
  assert.deepEqual(third.words, ['disclosure', 'liability'])
  assert.ok(!third.text.includes('{'), 'word marks are removed from the text')
})

test('an interaction carries options, hints, handlers and state changes', () => {
  const { lesson } = compile(episode, world)
  const interaction = lesson.scenes[0].steps.find((step) => step.kind === 'interaction')
  assert.ok(interaction && interaction.kind === 'interaction')
  assert.equal(interaction.options.length, 3)
  assert.equal(interaction.options.filter((option) => option.correct).length, 1)
  assert.deepEqual(interaction.words, ['verify'])
  assert.deepEqual(interaction.handlers.correct.map((action) => action.kind), ['evidence', 'set'])
  assert.equal(interaction.handlers.wrong[0].say?.speaker, 'harbor:priya')
  const branch = lesson.scenes[0].steps.find((step) => step.kind === 'branch')
  assert.ok(branch && branch.kind === 'branch')
  assert.deepEqual(branch.condition, { variable: 'trust.priya', op: '>', value: 0 })
  assert.equal(branch.steps.length, 3)
})

test('mistakes come back as repairable messages with suggestions', () => {
  const broken = `---
lesson: harbor:broken
state:
  trust.priya: 0
---
# scene s1 @harbor:office-nite
PRIYA (furious): "Hello."
PRIA: "Hi."
! camera drone
? lessonml:pick-evidence c1
  prompt: Which one?
  - A
  - B
  on correct: evidence smell b; set trust.dana += 1
if trust.pirya > 0:
  > ok
`
  const result = compile(broken, world)
  const text = formatDiagnostics(result.diagnostics)
  assert.equal(result.ok, false)
  for (const code of ['unknown-place', 'unknown-expression', 'unknown-speaker', 'correct-count', 'missing-hint', 'unknown-facet', 'undeclared-state']) {
    assert.ok(result.diagnostics.some((d) => d.code === code), `expected ${code} in\n${text}`)
  }
  assert.match(text, /Did you mean: @harbor:office-night/)
  assert.match(text, /Available: neutral, smile, stern, surprised, worried/)
  assert.match(text, /Did you mean: PRIYA/)
})

test('a stage verb is checked against the place it happens in', () => {
  const source = `---
lesson: harbor:t
---
# scene s1 @harbor:office-night
! camera drone
! zoom priya
`
  const codes = compile(source, world).diagnostics.map((d) => d.code)
  assert.deepEqual(codes, ['unknown-stage-arg', 'unknown-stage-verb'])
})

test('the world catalog renders as model context with every id spelled out', () => {
  const context = describeWorld(world)
  assert.match(context, /PRIYA \(harbor:priya\)/)
  assert.match(context, /@harbor:office-night/)
  assert.match(context, /! camera wide \| push/)
  assert.match(context, /lessonml:pick-evidence/)
})

test('parser reports lines outside a scene instead of guessing', () => {
  const { diagnostics } = parseScreenplay('---\nlesson: a:b\n---\nPRIYA: "hi"\n')
  assert.equal(diagnostics[0].code, 'outside-scene')
})
