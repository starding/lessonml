import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { compile, type World } from '../src/index.js'
import { LessonSession } from '../src/player/session.js'

const world = JSON.parse(fs.readFileSync('examples/harbor/world.json', 'utf8')) as World
const lesson = () => compile(fs.readFileSync('examples/harbor/compliance-call.lml', 'utf8'), world).lesson

const playTo = (session: LessonSession, kind: 'interaction' | 'end') => {
  while (session.frame.kind !== kind && session.next()) { /* advance */ }
  return session.frame
}

test('the first frame is the first line, with the stage set before it', () => {
  const session = new LessonSession(lesson())
  const frame = session.frame
  assert.equal(frame.kind, 'line')
  assert.equal(frame.stage.camera, 'priya')
  assert.deepEqual(frame.stage.effects, ['typing'])
  assert.equal(frame.stage.expressions['harbor:priya'], 'neutral')
})

test('effects last one step; camera and screen persist', () => {
  const session = new LessonSession(lesson())
  session.next()
  assert.deepEqual(session.frame.stage.effects, [], 'typing does not carry over')
  assert.equal(session.frame.stage.screen, 'share')
})

test('an interaction blocks until solved, and wrong answers give hints and handler lines', () => {
  const session = new LessonSession(lesson())
  const frame = playTo(session, 'interaction')
  assert.equal(frame.kind, 'interaction')
  assert.equal(session.next(), false, 'blocked')
  const wrong = session.choose(0)
  assert.equal(wrong.correct, false)
  const after = session.frame
  assert.ok(after.kind === 'interaction')
  assert.match(after.feedback?.hint || '', /可以核实/)
  assert.equal(after.feedback?.line?.text, 'Look again.')
  assert.equal(session.state['trust.priya'], 0)
  const right = session.choose(1)
  assert.equal(right.correct, true)
  assert.deepEqual(right.evidence.map((e) => [e.facet, e.word, e.firstTry]), [['read', 'verify', false]])
  assert.equal(session.state['trust.priya'], 1)
  assert.equal(session.next(), true)
})

test('free-text stage args persist, and the branch follows state', () => {
  const session = new LessonSession(lesson())
  playTo(session, 'interaction')
  session.choose(1)
  session.next()
  assert.equal(session.frame.stage.args.search, 'Northfield Research report')
  assert.deepEqual(session.frame.stage.effects, ['pip'])
  session.next()
  assert.ok(session.frame.kind === 'line')
  assert.match(session.frame.step.text, /You check before you speak/, 'trust > 0 opens the branch')
  assert.equal(session.frame.stage.expressions['harbor:priya'], 'smile')
  assert.equal(playTo(session, 'end').kind, 'end')
})

test('without the trust point the branch is skipped', () => {
  const plain = lesson()
  const session = new LessonSession(plain)
  playTo(session, 'interaction')
  // Solve through a path that does not raise trust: rewrite the handler.
  const frame = session.frame
  assert.ok(frame.kind === 'interaction')
  frame.step.handlers.correct = frame.step.handlers.correct.filter((action) => action.kind !== 'set')
  session.choose(1)
  session.next()
  session.next()
  assert.ok(session.frame.kind === 'line')
  assert.equal(session.frame.step.speaker, 'harbor:ledger')
})

test('back restores the previous frame and state exactly', () => {
  const session = new LessonSession(lesson())
  playTo(session, 'interaction')
  session.choose(1)
  session.next()
  assert.equal(session.state['trust.priya'], 1)
  session.back()
  assert.ok(session.frame.kind === 'interaction' && session.frame.solved)
  session.back()
  assert.equal((session.frame as { kind: string }).kind, 'line')
  assert.equal(session.state['trust.priya'], 0)
})
