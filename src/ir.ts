// LessonML intermediate representation (SPEC.md §4).
//
// Models write screenplay text (.lml); the compiler turns it into this IR and
// runtimes only ever read the IR. Everything a lesson refers to is a
// namespaced id resolved against a world catalog (catalog.ts).

export type Id = string // "namespace:name", e.g. "harbor:priya"

export interface Lesson {
  id: Id
  world: string
  language: string
  learnerLanguage?: string
  state: Record<string, number>
  // Named expressions over state, evaluated live (expr.ts): balance: principal * (1 + rate) ^ years
  formulas: Record<string, string>
  // Lesson-level senses; they override the world's glossary. Keys are target ids.
  glossary: Record<string, { gloss: string; definition?: string }>
  // Words the lesson was written to teach (e.g. a learner's frontier). The
  // compiler checks each one is a hotspot or a marked {word} somewhere.
  targets: string[]
  scenes: Scene[]
  // Illustrated pages (SPEC.md §11): a picture, its hotspots, and narration.
  pages: Page[]
}

// A page is one illustration the learner explores, with narration that tours it.
export interface Page {
  id: string
  // Optional: the world place the picture shows (for continuity and image references).
  place: Id | null
  line: number
  image: { src: string; width: number; height: number }
  // What the illustrator (a person or an image model) was asked to draw.
  art?: string
  spots: Spot[]
  steps: Step[]
}

// Something in the picture the learner can tap. Coordinates are image pixels.
export interface Spot {
  id: string
  // The word the spot teaches (a lemma); defaults to the id.
  word: string
  // Polygons; a rectangle is written as four numbers and stored as four points.
  shapes: [number, number][][]
  line: number
}

export interface Scene {
  id: string
  place: Id
  line: number
  steps: Step[]
}

export type Step = LineStep | StageStep | InteractionStep | BranchStep

// A spoken line or narration. `words` are the target words marked {like this}.
export interface LineStep {
  kind: 'line'
  line: number
  speaker: Id | null
  expression?: string
  text: string
  translation?: string
  words: string[]
  // Each {mark} as written and the word it teaches, in order: lets a player
  // wrap the surface form ("verified") while teaching the lemma ("verify").
  marks?: { surface: string; word: string }[]
  // On a page: spot ids the camera frames while this line is read.
  look?: string[]
}

// Stage direction: `! verb args...`. Verbs are defined by the place's set.
export interface StageStep {
  kind: 'stage'
  line: number
  verb: string
  args: string[]
}

export interface InteractionOption {
  text: string
  correct: boolean
  hint?: string
  line: number
}

export interface Action {
  kind: 'evidence' | 'set' | 'say'
  line: number
  // evidence: facet + target id; set: variable + op + value; say: a line step
  facet?: string
  target?: string
  variable?: string
  op?: '=' | '+=' | '-='
  // set: the right-hand side, an expression over state and formulas
  expr?: string
  say?: LineStep
}

// A learning interaction: the atom that produces evidence (SPEC.md §3.3).
export interface InteractionStep {
  kind: 'interaction'
  line: number
  component: Id
  id: string
  props: Record<string, string>
  words: string[]
  options: InteractionOption[]
  handlers: Record<string, Action[]>
}

export interface BranchStep {
  kind: 'branch'
  line: number
  // An expression over state and formulas; non-zero means taken.
  condition: string
  steps: Step[]
}

// Every problem is written for the model that wrote the text: where, what,
// and what would be valid instead (SPEC.md §6).
export interface Diagnostic {
  line: number
  code: string
  message: string
  suggestions?: string[]
}
