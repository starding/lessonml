import assert from 'node:assert/strict'
import test from 'node:test'
import { EXPRESSIONS, STYLE_PACKS, generateCharacter, renderCharacter, type CharacterSpec } from '../src/index.js'

const priya: CharacterSpec = { id: 'priya', hair: 'long', outfit: 'blazer', glasses: true, colors: { skin: '#ecc4a6', hair: '#231a2c', eyes: '#7a4a2a', cloth: '#3a3f5c' } }

test('every style pack renders the same part contract', () => {
  for (const style of Object.values(STYLE_PACKS)) {
    const svg = renderCharacter(priya, style)
    for (const group of ['hb', 'bd', 'nk', 'hf']) assert.ok(svg.includes(`class="${group}"`), `${style.id} ${group}`)
    for (const v of ['open', 'closed']) assert.ok(svg.includes(`data-part="eye" data-v="${v}"`), `${style.id} eye ${v}`)
    for (const v of [...EXPRESSIONS, 'talk']) assert.ok(svg.includes(`data-part="mouth" data-v="${v}"`), `${style.id} mouth ${v}`)
    for (const v of EXPRESSIONS) assert.ok(svg.includes(`data-part="brow" data-v="${v}"`), `${style.id} brow ${v}`)
  }
})

test('references inside a rendered character resolve, and ids do not collide across styles', () => {
  const all = Object.values(STYLE_PACKS).map((style) => renderCharacter(priya, style)).join('')
  const ids = Array.from(all.matchAll(/\bid="([^"]+)"/g), (match) => match[1])
  assert.equal(new Set(ids).size, ids.length, 'unique ids')
  for (const match of all.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(match[1]), `dangling #${match[1]}`)
})

test('style rules show up in the drawing', () => {
  const ligne = renderCharacter(priya, STYLE_PACKS['ligne-claire'])
  const flat = renderCharacter(priya, STYLE_PACKS['flat-modern'])
  assert.ok(ligne.includes('stroke="#1b1b1f"'), 'ligne claire draws one black line')
  assert.ok(!flat.includes('stroke-width="1.8"') && !flat.includes('linearGradient'), 'flat has no outlines or gradients')
})

test('the character creator is deterministic and always valid', () => {
  assert.deepEqual(generateCharacter(42), generateCharacter(42))
  for (let seed = 1; seed < 60; seed++) {
    const spec = generateCharacter(seed)
    assert.ok(['long', 'bob', 'short'].includes(spec.hair))
    assert.ok(renderCharacter(spec, STYLE_PACKS['anime-clean']).includes(`data-character="${spec.id}"`))
  }
})
