import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { compile, describeWorld, formatDiagnostics, type World } from '../src/index.js'

const world = JSON.parse(fs.readFileSync('examples/harvest/world.json', 'utf8')) as World
const episode = fs.readFileSync('examples/harvest/the-harvesters.lml', 'utf8')

// A minimal page lesson; `body` replaces the page body.
const lesson = (body: string, front = '') => `---
lesson: harvest:test
world: harvest
learner_language: zh-CN
${front}glossary:
  kettle: 水壶
  rely: 依靠
---
# page one @harvest:wheat-field
image: kitchen.jpg 1000x1500
${body}`
const codes = (source: string) => compile(source, world).diagnostics.map((d) => d.code)

test('the illustrated example compiles cleanly', () => {
  const result = compile(episode, world)
  assert.equal(formatDiagnostics(result.diagnostics), '')
  assert.equal(result.lesson.pages.length, 2)
  assert.equal(result.lesson.scenes.length, 0)
  assert.deepEqual(result.lesson.targets, ['scythe', 'sheaf', 'jug', 'nap', 'haystack', 'harvest', 'shade'])
})

test('a page carries its image, spots, narration, camera and find', () => {
  const page = compile(episode, world).lesson.pages[0]
  assert.equal(page.id, 'field')
  assert.equal(page.place, 'harvest:wheat-field')
  assert.deepEqual(page.image, { src: 'harvesters.jpg', width: 2400, height: 1769 })
  assert.match(page.art || '', /golden wheat/)
  const jug = page.spots.find((spot) => spot.id === 'jug-1')
  assert.equal(jug?.word, 'jug', 'a quoted word names the spot')
  assert.equal(jug?.shapes[0].length, 4, 'a rectangle becomes four points')
  const wheat = page.spots.find((spot) => spot.id === 'wheat')
  assert.equal(wheat?.shapes.length, 2, 'shapes joined with | stay separate')
  assert.equal(wheat?.shapes[1].length, 4, 'a poly keeps its points')
  const third = page.steps[2]
  assert.ok(third.kind === 'line')
  assert.deepEqual(third.words, ['sheaf'])
  assert.deepEqual(third.marks, [{ surface: 'sheaves', word: 'sheaf' }], 'the surface form is kept for the player')
  assert.deepEqual(third.look, ['sheaf'])
  assert.match(third.translation || '', /麦捆/)
  const find = page.steps.at(-1)
  assert.ok(find?.kind === 'interaction')
  assert.equal(find.component, 'lessonml:find')
  assert.equal(find.handlers.correct[0].target, 'en:jug')
})

test('a target that is neither drawn nor written is reported', () => {
  const source = lesson('spot kettle: 10 10 50 50\n> The {kettle} is on.', 'targets: kettle rely\n')
  const result = compile(source, world)
  assert.deepEqual(result.diagnostics.map((d) => d.code), ['target-not-covered'])
  assert.match(result.diagnostics[0].message, /rely/)
  assert.ok(compile(lesson('spot kettle: 10 10 50 50\n> We {rely} on the {kettle}.', 'targets: kettle rely\n'), world).ok)
})

test('look and find must name spots on the page', () => {
  const source = lesson('spot kettle: 10 10 50 50\n> The {kettle}.\n  look: kettel\n? lessonml:find f\n  prompt: Find it.\n  targets: kettle pot\n  on correct: evidence recall kettle')
  const diagnostics = compile(source, world).diagnostics
  assert.deepEqual(diagnostics.map((d) => d.code), ['unknown-spot', 'unknown-spot'])
  assert.deepEqual(diagnostics[0].suggestions?.[0], 'kettle')
})

test('spots are checked against the image', () => {
  assert.deepEqual(codes(lesson('spot kettle: 10 10 1200 50')), ['spot-outside-image'])
  assert.deepEqual(codes(lesson('spot kettle: 50 10 10 50')), ['spot-shape'])
  assert.deepEqual(codes(lesson('spot kettle: poly 1 2 3 4')), ['spot-shape'])
  assert.deepEqual(codes(lesson('spot kettle: 10 10 50 50\nspot kettle: 60 60 90 90')), ['duplicate-spot'])
  assert.ok(codes(lesson('spot kettle: 10 10 50 50 | poly 100 100 200 100 150 180')).length === 0)
})

test('every word on a page is explained for the learner', () => {
  assert.deepEqual(codes(lesson('spot kettle: 10 10 50 50\nspot pot: 60 60 90 90\n> A {pot} and a {spoon}.')), ['missing-gloss', 'missing-gloss', 'missing-gloss'].slice(0, 2))
})

test('pages refuse stage directions and components they cannot run', () => {
  assert.deepEqual(codes(lesson('spot kettle: 10 10 50 50\n! camera wide')), ['stage-on-page'])
  assert.deepEqual(codes(lesson('spot kettle: 10 10 50 50\n? lessonml:cloze c\n  line: The ___ is hot.\n  answer: kettle')), ['component-not-on-pages'])
})

test('a page needs an image', () => {
  const source = lesson('').replace('image: kitchen.jpg 1000x1500\n', 'image: kitchen.jpg\n')
  assert.deepEqual(compile(source, world).diagnostics.map((d) => d.code), ['missing-image', 'image-line'])
})

test('glossary keys with spaces are quoted', () => {
  const { lesson: parsed } = compile(episode, world)
  assert.equal(parsed.glossary['en:straw hat']?.gloss, '草帽')
})

test('the world description tells a model how places look and that pages exist', () => {
  const text = describeWorld(world)
  assert.match(text, /# page <id> @<place-id>/)
  assert.match(text, /Looks: Pieter Bruegel/)
  assert.match(text, /lessonml:find/)
})
