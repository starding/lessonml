// World catalogs and the core component catalog (SPEC.md §3).
//
// A catalog is everything a model may refer to. Each entry carries a short
// description written for the model, because the catalog is pasted into the
// model's context when it writes a lesson (describeWorld below).

import type { CharacterSpec } from './rig/rig.js'

export interface CharacterEntry {
  name: string
  description: string
  expressions: string[]
  rig?: CharacterSpec
  // A machine voice (an AI, a PA system): styled as the system, not a person.
  system?: boolean
}

export interface PlaceEntry {
  name: string
  description: string
  // Stage verbs this place understands and the arguments each accepts,
  // e.g. { camera: ["wide", "priya"], effect: ["shake"] }.
  stage: Record<string, string[]>
  // The drawing that plays this place (a set id known to the player) and who
  // sits in each of the set's character slots.
  set?: string
  cast?: Record<string, string>
}

// A term as this world means it: the in-context sense, not the dictionary's
// most common one (pitch = 提案 in a boardroom, 音高 in a music room).
export interface GlossEntry {
  gloss: string
  definition?: string
}

export interface World {
  namespace: string
  title: string
  characters: Record<string, CharacterEntry>
  places: Record<string, PlaceEntry>
  // Keys are target ids, e.g. "en:pitch" or "math:denominator".
  glossary?: Record<string, GlossEntry>
}

// Evidence facets (SPEC.md §3.2): a small core every subject shares, plus
// packs a subject adds. An evidence event is (facet, target), where the target
// is a namespaced id: "en:verify", "math:fraction-equivalence".
export const FACET_PACKS = {
  core: {
    recall: 'remembers it when asked',
    apply: 'uses it correctly in a new situation',
    explain: 'says why, in their own words',
    predict: 'anticipates what will happen before seeing it'
  },
  language: {
    read: 'understands it in written context',
    listen: 'understands it when heard',
    speak: 'says it aloud, correctly',
    write: 'produces it in writing'
  },
  math: {
    compute: 'carries out the calculation correctly'
  }
} as const
export type EvidenceFacet = { [P in keyof typeof FACET_PACKS]: keyof (typeof FACET_PACKS)[P] }[keyof typeof FACET_PACKS]
export const EVIDENCE_FACETS = Object.values(FACET_PACKS).flatMap((pack) => Object.keys(pack)) as EvidenceFacet[]

// "verify" in an English lesson is "en:verify"; ids with a namespace stay as written.
export const TARGET_ID = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9/'-]*$/
export const toTargetId = (target: string, language: string) => (target.includes(':') ? target : `${language}:${target.toLowerCase()}`)

export interface ComponentEntry {
  description: string
  props: { required: string[]; optional: string[] }
  options: { min: number; max: number; correct: 'one' | 'none' | 'any' } | null
  events: string[]
  // Evidence this component can produce; handlers may only claim these facets.
  facets: EvidenceFacet[]
  example: string
}

// Core components: language learning first, but none of them is about
// language only (SPEC.md §3.3).
export const CORE_COMPONENTS: Record<string, ComponentEntry> = {
  'lessonml:pick-evidence': {
    description: 'The learner taps the one statement that answers the prompt (the unverifiable claim, the cause, the wrong step). Works in any subject.',
    props: { required: ['prompt'], optional: ['title'] },
    options: { min: 2, max: 5, correct: 'one' },
    events: ['correct', 'wrong'],
    facets: ['read', 'recall', 'apply'],
    example: '? lessonml:pick-evidence case-1\n  prompt: Which sentence can\'t be {verified|verify}?\n  - Revenue rose 18%.\n    hint: This comes from the filing.\n  * An analyst report calls it a clean beat.\n  on correct: evidence read verify'
  },
  'lessonml:cloze': {
    description: 'The learner types the missing word or value into a line (a log, a rule, a formula: "2/4 = ___/8"). Typed recall is productive evidence.',
    props: { required: ['line', 'answer'], optional: ['title'] },
    options: { min: 0, max: 4, correct: 'none' },
    events: ['correct', 'wrong'],
    facets: ['write', 'recall', 'compute', 'apply'],
    example: '? lessonml:cloze rule-1\n  line: Ledger must ___ every source.\n  answer: verify\n  - disclose\n    hint: That means "make public".\n  on correct: evidence write verify'
  },
  'lessonml:choose-reply': {
    description: 'The learner picks what to say next; the other character reacts in the handler. Use for tone, register and judgment.',
    props: { required: ['prompt'], optional: ['title'] },
    options: { min: 2, max: 4, correct: 'one' },
    events: ['correct', 'wrong'],
    facets: ['read', 'apply'],
    example: '? lessonml:choose-reply reply-1\n  prompt: Dana asks if you can ship tonight.\n  * Not until every source is {verified|verify}.\n  - Sure, it is probably fine.\n  on correct: set trust.dana += 1\n  on wrong: DANA (stern): "Probably isn\'t a plan."'
  },
  'lessonml:speak': {
    description: 'The learner says a sentence out loud; speech recognition checks the target word was said.',
    props: { required: ['prompt', 'target'], optional: ['model', 'title'] },
    options: null,
    events: ['spoken', 'missed'],
    facets: ['speak'],
    example: '? lessonml:speak ask-ledger\n  prompt: Ask Ledger whether it made the report up.\n  target: verify\n  on spoken: evidence speak verify'
  },
  'lessonml:numeric': {
    description: 'The learner types a number (and unit if asked), checked against an expression within a tolerance: estimates, calculations, predictions. Wrong values get "too high / too low", or the hint of a matching distractor.',
    props: { required: ['prompt', 'answer'], optional: ['tolerance', 'unit', 'title'] },
    options: { min: 0, max: 4, correct: 'none' },
    events: ['correct', 'wrong'],
    facets: ['compute', 'predict', 'apply'],
    example: '? lessonml:numeric guess\n  prompt: After {=years} years at {=rate*100}%, how much is in the account?\n  answer: balance\n  tolerance: 2%\n  - 1500\n    hint: 那是单利：每年只按本金算利息。\n  on correct: evidence compute math:compound-interest'
  },
  'lessonml:explore': {
    description: 'Sliders bound to state variables; the scene, formulas and live text update as the learner moves them. Solved when the goal expression becomes true. Use it to let the learner discover a relationship.',
    props: { required: ['prompt', 'controls', 'goal'], optional: ['title'] },
    options: null,
    events: ['correct'],
    facets: ['apply', 'predict', 'explain'],
    example: '? lessonml:explore double-it\n  prompt: Move the sliders until the money doubles.\n  controls: rate 0.01..0.12 step 0.01, years 1..30 step 1\n  goal: balance >= 2 * principal\n  on correct: evidence apply math:compound-interest'
  },
  'lessonml:write': {
    description: 'The learner writes a few sentences (a reply, an explanation of their reasoning). A reviewer supplied by the host app judges it; without one, the player checks the required words and length.',
    props: { required: ['prompt'], optional: ['targets', 'min_words', 'model', 'title'] },
    options: null,
    events: ['correct', 'wrong'],
    facets: ['write', 'explain', 'apply'],
    example: '? lessonml:write why-equal\n  prompt: Explain why 2/4 and 1/2 are the same amount.\n  targets: numerator, denominator\n  min_words: 12\n  on correct: evidence explain math:fraction-equivalence'
  }
}

const closest = (value: string, candidates: string[], limit = 3) => {
  const distance = (a: string, b: string) => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0]
      row[0] = i
      for (let j = 1; j <= b.length; j++) {
        const current = row[j]
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
        previous = current
      }
    }
    return row[b.length]
  }
  return [...candidates].sort((a, b) => distance(value, a) - distance(value, b)).slice(0, limit)
}
export { closest }

// The catalog as model context: compact, every id spelled exactly as it must
// be written.
export const describeWorld = (world: World) => {
  const lines = [`# World ${world.namespace}: ${world.title}`, '', '## Characters (write the NAME in capitals as the speaker)']
  for (const [key, character] of Object.entries(world.characters)) {
    lines.push(`- ${character.name.toUpperCase()} (${world.namespace}:${key}): ${character.description} Expressions: ${character.expressions.join(', ')}.`)
  }
  lines.push('', '## Places (start a scene with "# scene <id> @<place-id>")')
  for (const [key, place] of Object.entries(world.places)) {
    lines.push(`- @${world.namespace}:${key}: ${place.description}`)
    for (const [verb, args] of Object.entries(place.stage)) lines.push(`  ! ${verb} ${args.includes('*') ? '<free text>' : args.join(' | ')}`)
  }
  if (world.glossary && Object.keys(world.glossary).length) {
    lines.push('', '## Glossary (the sense each term has in this world)')
    for (const [id, entry] of Object.entries(world.glossary)) lines.push(`- ${id}: ${entry.gloss}${entry.definition ? ` — ${entry.definition}` : ''}`)
  }
  lines.push('', '## Evidence facets (evidence <facet> <target>; a bare word means <language>:<word>)')
  for (const [pack, facets] of Object.entries(FACET_PACKS)) lines.push(`- ${pack}: ${Object.entries(facets).map(([facet, meaning]) => `${facet} (${meaning})`).join(', ')}`)
  lines.push('', '## Components (start with "? <component> <id>")')
  for (const [id, component] of Object.entries(CORE_COMPONENTS)) {
    lines.push(`- ${id}: ${component.description} Events: ${component.events.join(', ')}. Evidence: ${component.facets.join(', ')}.`)
  }
  return lines.join('\n')
}
