// The lesson interpreter (SPEC.md §8, v0.2): a pure state machine over the IR.
//
// It owns order, state, branches, blocking and evidence. It knows nothing
// about drawing, so every runtime (web component, native app, tests) plays a
// lesson the same way.
//
// Stage semantics:
//   camera / screen     persist until changed
//   effect <name>       applies to the next line or interaction only
//   any other verb      persists its latest args (e.g. "search <query>")
//   NAME (expr): …      sets that character's expression until changed

import type { Action, InteractionStep, Lesson, LineStep, Step } from '../ir.js'

export interface StageState {
  sceneId: string
  place: string
  camera: string | null
  screen: string | null
  effects: string[]
  expressions: Record<string, string>
  args: Record<string, string>
}

export interface EvidenceEvent {
  facet: string
  word: string
  interaction: string
  firstTry: boolean
  // Position in the lesson, so a host can de-duplicate on replay.
  at: number
}

export type Frame =
  | { kind: 'line'; index: number; step: LineStep; stage: StageState }
  | {
    kind: 'interaction'
    index: number
    step: InteractionStep
    stage: StageState
    solved: boolean
    misses: number[]
    // The last thing said in reaction to an attempt (hint or a handler line).
    feedback: { line: LineStep | null; hint: string | null } | null
  }
  | { kind: 'end'; index: number; stage: StageState }

interface Cursor { steps: Step[]; at: number }

interface Internal {
  stack: Cursor[]
  sceneIndex: number
  state: Record<string, number>
  stage: StageState
  pendingEffects: string[]
  frame: Frame | null
  count: number
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

export interface AnswerResult {
  correct: boolean
  evidence: EvidenceEvent[]
}

export class LessonSession {
  readonly lesson: Lesson
  private s: Internal
  private history: Internal[] = []
  readonly evidence: EvidenceEvent[] = []

  constructor(lesson: Lesson) {
    this.lesson = lesson
    const first = lesson.scenes[0]
    this.s = {
      stack: first ? [{ steps: first.steps, at: 0 }] : [],
      sceneIndex: 0,
      state: { ...lesson.state },
      stage: { sceneId: first?.id ?? '', place: first?.place ?? '', camera: null, screen: null, effects: [], expressions: {}, args: {} },
      pendingEffects: [],
      frame: null,
      count: 0
    }
    this.advance()
  }

  get frame(): Frame { return this.s.frame as Frame }
  get state(): Readonly<Record<string, number>> { return this.s.state }
  get canGoBack() { return this.history.length > 0 }
  get blocked() { return this.frame.kind === 'interaction' && !this.frame.solved }

  // Move to the next line or interaction. Returns false when blocked or at the end.
  next(): boolean {
    if (this.frame.kind === 'end' || this.blocked) return false
    this.history.push(clone(this.s))
    this.advance()
    return true
  }

  back(): boolean {
    const previous = this.history.pop()
    if (!previous) return false
    this.s = previous
    return true
  }

  // pick-evidence / choose-reply: the learner chose option `index`.
  choose(index: number): AnswerResult {
    const frame = this.requireInteraction()
    const option = frame.step.options[index]
    if (!option) throw new Error(`option ${index} does not exist`)
    return this.resolve(frame, option.correct, index, option.hint ?? null)
  }

  // cloze: the learner typed `text`.
  type(text: string): AnswerResult {
    const frame = this.requireInteraction()
    const typed = text.trim().toLowerCase()
    const correct = typed === (frame.step.props.answer || '').trim().toLowerCase()
    const distractor = frame.step.options.findIndex((option) => option.text.trim().toLowerCase() === typed)
    return this.resolve(frame, correct, distractor >= 0 ? distractor : -1, distractor >= 0 ? frame.step.options[distractor].hint ?? null : null)
  }

  // speak: recognition (or the learner's self-report) says whether the target was said.
  spoke(ok: boolean): AnswerResult {
    const frame = this.requireInteraction()
    return this.resolve(frame, ok, -1, null, ok ? 'spoken' : 'missed')
  }

  private requireInteraction() {
    const frame = this.frame
    if (frame.kind !== 'interaction') throw new Error('no interaction is open')
    if (frame.solved) throw new Error('interaction already solved')
    return frame
  }

  private resolve(frame: Extract<Frame, { kind: 'interaction' }>, correct: boolean, missIndex: number, hint: string | null, eventName?: string): AnswerResult {
    const event = eventName || (correct ? 'correct' : 'wrong')
    const firstTry = frame.misses.length === 0
    const evidence: EvidenceEvent[] = []
    let said: LineStep | null = null
    for (const action of frame.step.handlers[event] || []) {
      const result = this.apply(action, frame.step, firstTry && correct, frame.index)
      if (result.evidence) evidence.push(result.evidence)
      if (result.say) said = result.say
    }
    if (correct) {
      frame.solved = true
      frame.feedback = said ? { line: said, hint: null } : null
    } else {
      if (missIndex >= 0 && !frame.misses.includes(missIndex)) frame.misses.push(missIndex)
      if (missIndex < 0) frame.misses.push(-1)
      frame.feedback = { line: said, hint }
    }
    this.evidence.push(...evidence)
    return { correct, evidence }
  }

  private apply(action: Action, step: InteractionStep, firstTry: boolean, at: number): { evidence?: EvidenceEvent; say?: LineStep } {
    if (action.kind === 'evidence') return { evidence: { facet: action.facet!, word: action.word!, interaction: step.id, firstTry, at } }
    if (action.kind === 'set') {
      const current = this.s.state[action.variable!] ?? 0
      const value = action.value ?? 0
      this.s.state[action.variable!] = action.op === '+=' ? current + value : action.op === '-=' ? current - value : value
      return {}
    }
    if (action.say?.speaker && action.say.expression) this.s.stage.expressions[action.say.speaker] = action.say.expression
    return { say: action.say }
  }

  private evaluate(step: Extract<Step, { kind: 'branch' }>) {
    const value = this.s.state[step.condition.variable] ?? 0
    const target = step.condition.value
    switch (step.condition.op) {
      case '>': return value > target
      case '<': return value < target
      case '>=': return value >= target
      case '<=': return value <= target
      case '==': return value === target
      default: return value !== target
    }
  }

  private emit(frame: Frame) {
    this.s.frame = frame
    this.s.count += 1
  }

  private stageForStep(): StageState {
    const stage = clone(this.s.stage)
    stage.effects = this.s.pendingEffects
    this.s.pendingEffects = []
    return stage
  }

  private advance() {
    const s = this.s
    for (;;) {
      const top = s.stack[s.stack.length - 1]
      if (!top) {
        const nextScene = this.lesson.scenes[s.sceneIndex + 1]
        if (!nextScene) {
          this.emit({ kind: 'end', index: s.count, stage: this.stageForStep() })
          return
        }
        s.sceneIndex += 1
        s.stack.push({ steps: nextScene.steps, at: 0 })
        s.stage = { ...s.stage, sceneId: nextScene.id, place: nextScene.place, camera: null, screen: null }
        continue
      }
      if (top.at >= top.steps.length) {
        s.stack.pop()
        continue
      }
      const step = top.steps[top.at++]
      if (step.kind === 'stage') {
        if (step.verb === 'camera') s.stage.camera = step.args[0] ?? null
        else if (step.verb === 'screen') s.stage.screen = step.args[0] ?? null
        else if (step.verb === 'effect') s.pendingEffects.push(...step.args)
        else s.stage.args[step.verb] = step.args.join(' ').replace(/"/g, '')
        continue
      }
      if (step.kind === 'branch') {
        if (this.evaluate(step)) s.stack.push({ steps: step.steps, at: 0 })
        continue
      }
      if (step.kind === 'line') {
        if (step.speaker && step.expression) s.stage.expressions[step.speaker] = step.expression
        this.emit({ kind: 'line', index: s.count, step, stage: this.stageForStep() })
        return
      }
      this.emit({ kind: 'interaction', index: s.count, step, stage: this.stageForStep(), solved: false, misses: [], feedback: null })
      return
    }
  }
}
