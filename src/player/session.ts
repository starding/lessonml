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
import { INTERPOLATION, formatNumber, makeScope } from '../expr.js'
import { parseControls, parseNumericAnswer, snap, withinTolerance } from '../controls.js'

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
  // Namespaced target id: "en:verify", "math:fraction-equivalence".
  target: string
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
    feedback: { line: LineStep | null; hint: string | null; direction?: 'high' | 'low' | 'unit' } | null
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

  private exprCache = new Map()

  get frame(): Frame { return this.s.frame as Frame }

  // Evaluate an expression over the current state and the lesson's formulas.
  evaluate(source: string): number {
    return makeScope(this.s.state, this.lesson.formulas, this.exprCache).evaluate(source)
  }

  // Evaluate with some state overridden (plots sweep a variable this way).
  evaluateWith(source: string, overrides: Record<string, number>): number {
    return makeScope({ ...this.s.state, ...overrides }, this.lesson.formulas, this.exprCache).evaluate(source)
  }

  // Replace {=expression} with its current value.
  interpolate(text: string): string {
    return text.replace(INTERPOLATION, (_, source: string) => {
      try { return formatNumber(this.evaluate(source)) } catch { return '?' }
    })
  }
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

  // numeric: the learner typed a value (and maybe a unit).
  numeric(input: string): AnswerResult {
    const frame = this.requireInteraction()
    const parsed = parseNumericAnswer(input)
    const expected = this.evaluate(frame.step.props.answer)
    const tolerance = frame.step.props.tolerance
    const unit = (frame.step.props.unit || '').trim().toLowerCase()
    if (!parsed) return this.resolve(frame, false, -1, null, undefined, undefined)
    const unitOk = !unit || parsed.unit.toLowerCase() === unit
    const valueOk = withinTolerance(parsed.value, expected, tolerance)
    if (valueOk && unitOk) return this.resolve(frame, true, -1, null)
    const distractor = frame.step.options.findIndex((option) => {
      const value = parseNumericAnswer(option.text)?.value
      return value !== undefined && withinTolerance(parsed.value, value, tolerance)
    })
    if (distractor >= 0) return this.resolve(frame, false, distractor, frame.step.options[distractor].hint ?? null)
    return this.resolve(frame, false, -1, null, undefined, valueOk ? 'unit' : parsed.value > expected ? 'high' : 'low')
  }

  // explore: the learner moved a slider. Returns whether the goal is now met.
  adjust(name: string, value: number): AnswerResult & { value: number } {
    const frame = this.requireInteraction()
    const control = parseControls(frame.step.props.controls || '').controls.find((candidate) => candidate.name === name)
    if (!control) throw new Error(`${name} is not a control of ${frame.step.id}`)
    const snapped = snap(control, value)
    this.s.state[name] = snapped
    if (this.evaluate(frame.step.props.goal)) return { ...this.resolve(frame, true, -1, null), value: snapped }
    return { correct: false, evidence: [], value: snapped }
  }

  // A setting of the explore controls that meets the goal (grid search), or null.
  findGoal(): Record<string, number> | null {
    const frame = this.frame
    if (frame.kind !== 'interaction' || frame.step.component !== 'lessonml:explore') return null
    const controls = parseControls(frame.step.props.controls || '').controls.slice(0, 3)
    const grids = controls.map((control) => {
      const count = Math.min(40, Math.round((control.max - control.min) / control.step) + 1)
      return Array.from({ length: count }, (_, i) => snap(control, control.min + (control.max - control.min) * (count === 1 ? 0 : i / (count - 1))))
    })
    const saved = { ...this.s.state }
    const walk = (index: number, chosen: Record<string, number>): Record<string, number> | null => {
      if (index === controls.length) {
        Object.assign(this.s.state, chosen)
        return this.evaluate(frame.step.props.goal) ? { ...chosen } : null
      }
      for (const value of grids[index]) {
        const found = walk(index + 1, { ...chosen, [controls[index].name]: value })
        if (found) return found
      }
      return null
    }
    const found = walk(0, {})
    this.s.state = saved
    return found
  }

  // write: the host's reviewer (or the default check) judged the text.
  reviewed(pass: boolean, feedback?: string): AnswerResult {
    const frame = this.requireInteraction()
    return this.resolve(frame, pass, -1, feedback ?? null)
  }

  private requireInteraction() {
    const frame = this.frame
    if (frame.kind !== 'interaction') throw new Error('no interaction is open')
    if (frame.solved) throw new Error('interaction already solved')
    return frame
  }

  private resolve(frame: Extract<Frame, { kind: 'interaction' }>, correct: boolean, missIndex: number, hint: string | null, eventName?: string, direction?: 'high' | 'low' | 'unit'): AnswerResult {
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
      frame.feedback = { line: said, hint, direction }
    }
    this.evidence.push(...evidence)
    return { correct, evidence }
  }

  private apply(action: Action, step: InteractionStep, firstTry: boolean, at: number): { evidence?: EvidenceEvent; say?: LineStep } {
    if (action.kind === 'evidence') return { evidence: { facet: action.facet!, target: action.target!, interaction: step.id, firstTry, at } }
    if (action.kind === 'set') {
      const current = this.s.state[action.variable!] ?? 0
      const value = this.evaluate(action.expr || '0')
      this.s.state[action.variable!] = action.op === '+=' ? current + value : action.op === '-=' ? current - value : value
      return {}
    }
    if (action.say?.speaker && action.say.expression) this.s.stage.expressions[action.say.speaker] = action.say.expression
    return { say: action.say }
  }

  private branchTaken(step: Extract<Step, { kind: 'branch' }>) {
    return Boolean(this.evaluate(step.condition))
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
        if (this.branchTaken(step)) s.stack.push({ steps: step.steps, at: 0 })
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
