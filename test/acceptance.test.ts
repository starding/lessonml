import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { compile, defaultReviewer, getSet, LessonSession, type Frame, type World } from '../src/index.js'
import { simulate } from '../src/mcp/simulate.js'

// Cross-subject acceptance (SPEC.md §1): every example lesson, language and
// math alike, must compile, play to the end without warnings, and have a set.
const lessons = fs.readdirSync('examples').flatMap((dir) => fs.readdirSync(path.join('examples', dir))
  .filter((file) => file.endsWith('.lml')).map((file) => path.join('examples', dir, file)))

for (const file of lessons) {
  test(`${file} compiles, plays through cleanly and has a set`, () => {
    const source = fs.readFileSync(file, 'utf8')
    const world = JSON.parse(fs.readFileSync(path.join(path.dirname(file), 'world.json'), 'utf8')) as World
    const result = compile(source, world)
    assert.deepEqual(result.diagnostics, [])
    const transcript = simulate(result.lesson, {}, world)
    assert.ok(!/^warning:/m.test(transcript), transcript)
    for (const scene of result.lesson.scenes) assert.ok(getSet(world.places[scene.place.split(':')[1]].set), `${scene.place} has a set`)
  })
}

test('the math lesson is a real non-language lesson: math targets, math facets', () => {
  assert.ok(lessons.some((file) => file.includes('classroom')), 'a math lesson exists')
  const world = JSON.parse(fs.readFileSync('examples/classroom/world.json', 'utf8')) as World
  const { lesson } = compile(fs.readFileSync('examples/classroom/equal-fractions.lml', 'utf8'), world)
  const session = new LessonSession(lesson)
  while (session.frame.kind !== 'end') {
    const frame = session.frame
    if (frame.kind === 'interaction') {
      if (frame.step.component === 'lessonml:cloze') session.type(frame.step.props.answer)
      else if (frame.step.component === 'lessonml:write') session.reviewed(true)
      else session.choose(frame.step.options.findIndex((option) => option.correct))
    }
    session.next()
  }
  assert.deepEqual(session.evidence.map((event) => `${event.facet} ${event.target}`), ['apply math:fraction-equivalence', 'compute math:fraction-equivalence', 'explain math:fraction-equivalence'])
})

test('glossary: bare terms belong to the lesson language; lesson senses override the world', () => {
  const world = JSON.parse(fs.readFileSync('examples/classroom/world.json', 'utf8')) as World
  const source = fs.readFileSync('examples/classroom/equal-fractions.lml', 'utf8').replace('state:\n  confidence: 0', 'state:\n  confidence: 0\nglossary:\n  equivalent: 相等的 | equal in value')
  const { lesson, ok } = compile(source, world)
  assert.ok(ok)
  assert.deepEqual(lesson.glossary['en:equivalent'], { gloss: '相等的', definition: 'equal in value' })
})

test('the default reviewer checks required words and length, with feedback', async () => {
  const input = { prompt: '', targets: ['numerator', 'denominator'], minWords: 8, language: 'en' }
  assert.deepEqual(await defaultReviewer({ ...input, text: 'Both are half.' }), { pass: false, feedback: 'Use: numerator, denominator' })
  assert.equal((await defaultReviewer({ ...input, text: 'The numerator and denominator doubled.' })).pass, false)
  assert.equal((await defaultReviewer({ ...input, text: 'Multiplying the numerator and the denominator by two keeps the same amount.' })).pass, true)
})

test('the compound-interest lesson computes: live text, numeric checks, explore goals', () => {
  const world = JSON.parse(fs.readFileSync('examples/classroom/world.json', 'utf8')) as World
  const { lesson, ok } = compile(fs.readFileSync('examples/classroom/compound-interest.lml', 'utf8'), world)
  assert.ok(ok)
  const session = new LessonSession(lesson)
  while (session.frame.kind !== 'interaction') session.next()
  assert.equal(session.numeric('$2,500').correct, false)
  const frame = session.frame
  assert.ok(frame.kind === 'interaction' && frame.feedback?.direction === 'high')
  assert.equal(session.numeric('1650').correct, true, 'within 5%')
  session.next()
  const reveal = session.frame as Frame
  assert.ok(reveal.kind === 'line')
  assert.match(session.interpolate(reveal.step.text), /^1,629 dollars\. The extra 129/)
  session.next()
  assert.equal(session.adjust('years', 20).correct, false, 'overshooting is not "just doubling"')
  assert.equal(session.adjust('years', 14).correct, false, '1.05^14 ≈ 1.98 is not yet double')
  assert.equal(session.adjust('years', 15).correct, true, '1.05^15 ≈ 2.08 just doubles')
})
