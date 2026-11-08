// <lml-scene>: plays a LessonML lesson in any web page (SPEC.md §8, v0.2).
//
//   <script type="module" src="lessonml/dist/src/player/element.js"></script>
//   <lml-scene src="lesson.lml" world="world.json" style-pack="anime-clean"></lml-scene>
//
// The element draws; LessonSession decides; the place's set (src/sets) supplies
// the art. Two modes, like <video>:
//   standalone (default)  its own navigation: swipe up / wheel / ↓ / Space
//                         moves on, ↑ goes back, tapping a line looks closer
//   controls="host"       the host app drives: call next() / back(), listen
//                         to lml-frame, draw its own hints
// Events: lml-frame (every frame), lml-evidence, lml-state, lml-word (with the
// lesson's gloss), lml-end, lml-error. Set `reviewer` to judge write tasks.

import { compile, formatDiagnostics } from '../validate.js'
import { toTargetId, type GlossEntry, type World } from '../catalog.js'
import type { InteractionStep, LineStep } from '../ir.js'
import { STYLE_PACKS } from '../rig/styles.js'
import { setExpression, setEyes, setMouth } from '../rig/controls.js'
import { LessonSession, type Frame } from './session.js'
import { getSet, registeredSets, type SetDefinition, type SetRuntime } from '../sets/index.js'
import { parseControls } from '../controls.js'
import { formatNumber } from '../expr.js'

import { defaultReviewer, type Reviewer } from './reviewer.js'
export { defaultReviewer, type Reviewer }

const UI = {
  en: { next: 'Swipe up to continue ↑', blocked: 'Solve it to continue', solveHere: 'Tap the answer on the screen', end: 'End of lesson', replay: 'Play again', check: 'Check', say: 'Say it', listening: 'Listening…', typeInstead: 'Type what you would say', tapForTranslation: 'Tap for translation', move: 'Your move', fill: 'Fill in the blank.', high: 'Too high. Try again.', low: 'Too low. Try again.', unit: 'Right number. Check the unit.', goalMet: 'Got it!', write: 'Write your answer…', submit: 'Submit', reviewing: 'Reviewing…' },
  zh: { next: '上滑继续 ↑', blocked: '完成这一关后上滑继续', solveHere: '在屏幕上点出答案', end: '本课完', replay: '再看一遍', check: '确定', say: '开口说', listening: '正在听…', typeInstead: '也可以打出你要说的话', tapForTranslation: '轻触对白看中文', move: '轮到你了', fill: '把空缺处填上。', high: '偏高了，再试试。', low: '偏低了，再试试。', unit: '数对了，检查一下单位。', goalMet: '做到了！', write: '写下你的回答……', submit: '提交', reviewing: '正在点评…' }
}

const TILT: Record<string, number> = { neutral: 0, smile: 1.5, stern: -2, surprised: 0, worried: 2.5 }

const CSS = `
:host { display:block; position:relative; height:100%; min-height:420px; overflow:hidden; background:#05060d; color:#eef1ff;
  font-family:-apple-system,"PingFang SC","Helvetica Neue",Arial,sans-serif; -webkit-user-select:none; user-select:none; touch-action:none; }
svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
.vignette { position:absolute; inset:0; pointer-events:none; background:radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,.55) 100%); }
.scan { position:absolute; left:0; right:0; height:140px; top:-140px; pointer-events:none; background:linear-gradient(transparent, rgba(95,227,255,.28), transparent); }
.scan.run { animation:scan 1.3s ease-in-out; }
@keyframes scan { to { top:110%; } }
.bottom { position:absolute; left:12px; right:12px; bottom:10px; max-width:760px; margin:0 auto; display:flex; flex-direction:column; gap:10px; }
.box { position:relative; border-radius:20px; padding:20px 18px 12px; background:rgba(9,11,26,.8); border:1px solid rgba(255,255,255,.12);
  -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); box-shadow:0 18px 50px rgba(0,0,0,.45); }
.box.system { border-color:rgba(95,227,255,.55); }
.tag { position:absolute; top:-12px; left:16px; padding:4px 12px; border-radius:999px; font-size:12px; font-weight:800; letter-spacing:.08em; background:#2a2f55; color:#fff; }
.tag:empty { display:none; }
.box.system .tag { background:#0c2a33; color:#5fe3ff; border:1px solid rgba(95,227,255,.5); font-family:ui-monospace,Menlo,monospace; }
.text { margin:0; font-size:17px; line-height:1.55; min-height:3.1em; }
.box.system .text { font-family:ui-monospace,Menlo,monospace; font-size:15.5px; color:#c9f6ff; }
.text .h { visibility:hidden; }
.text b { color:#ffb27a; border-bottom:1.5px dashed rgba(255,178,122,.6); cursor:pointer; font-weight:700; }
.translation { margin:8px 0 0; font-size:14px; line-height:1.6; color:#9aa3c7; display:none; }
.box.open .translation { display:block; }
.foot { margin-top:8px; font-size:12px; color:rgba(154,163,199,.8); min-height:1em; }
.hint { align-self:center; border:0; background:transparent; color:rgba(238,241,255,.72); font-size:12px; padding:4px 8px; cursor:pointer; }
.panel { display:flex; flex-direction:column; gap:8px; }
.panel:empty { display:none; }
.panel button.option { text-align:left; border-radius:14px; padding:12px 14px; font-size:15px; line-height:1.45; cursor:pointer;
  background:rgba(20,23,41,.92); color:#eef1ff; border:1px solid rgba(255,255,255,.14); }
.panel button.option.wrong { border-color:#ff6b6b; color:#c9cbe0; }
.panel button.option.right { border-color:#5fe3ff; }
.panel .row { display:flex; gap:8px; }
.panel input { flex:1; border-radius:12px; border:1px solid rgba(255,255,255,.2); background:rgba(9,11,26,.9); color:#fff; font-size:16px; padding:10px 12px; }
.panel .act { border-radius:12px; border:0; background:#eef1ff; color:#0b0d1a; font-weight:700; padding:10px 16px; cursor:pointer; }
.panel textarea { border-radius:12px; border:1px solid rgba(255,255,255,.2); background:rgba(9,11,26,.92); color:#fff; font:15px/1.5 inherit; padding:10px 12px; min-height:84px; resize:none; }
.panel .slider { display:grid; grid-template-columns:72px 1fr 64px; align-items:center; gap:10px; background:rgba(9,11,26,.88); border:1px solid rgba(255,255,255,.14); border-radius:14px; padding:10px 12px; font-size:14px; }
.panel .slider .name { font-family:ui-monospace,Menlo,monospace; color:#c9f6ff; }
.panel .slider .value { text-align:right; font-variant-numeric:tabular-nums; font-weight:700; }
.panel .slider input { width:100%; accent-color:#ffb27a; }
.panel .line { font-family:ui-monospace,Menlo,monospace; font-size:14px; background:rgba(9,17,32,.92); border:1px solid rgba(95,227,255,.3); border-radius:12px; padding:10px 12px; color:#c9f6ff; }
.end { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; background:rgba(5,6,13,.6); }
.end h2 { margin:0; font-size:34px; letter-spacing:.14em; }
.end button { border:1px solid rgba(255,255,255,.3); background:rgba(255,255,255,.06); color:#fff; border-radius:999px; padding:10px 22px; font-size:14px; cursor:pointer; }
svg.still, svg.still * { transition:none !important; }
.errors { position:absolute; inset:16px; overflow:auto; margin:0; white-space:pre-wrap; font:13px/1.6 ui-monospace,Menlo,monospace; color:#ffb4b4; }
`

type Ui = typeof UI.en

export class LmlSceneElement extends HTMLElement {
  static observedAttributes = ['src', 'world', 'style-pack']

  // Judges lessonml:write answers; replace with the host app's (an LLM, a teacher queue).
  reviewer: Reviewer = defaultReviewer

  private root: ShadowRoot
  private svg!: SVGSVGElement
  private bottom!: HTMLDivElement
  private session: LessonSession | null = null
  private world: World | null = null
  private ui: Ui = UI.en
  private alive = false
  private timers: number[] = []
  private frameId = 0
  private typingTimer = 0
  private typing: { done: () => void } | null = null
  private talking: string | null = null
  private set: SetDefinition | null = null
  private runtime!: SetRuntime
  private get hostControls() { return this.getAttribute('controls') === 'host' }
  private engine = {
    size: { w: 1, h: 1 }, bottomInset: 220,
    camera: { s: 1, x: 0, y: 0, ts: 1, tx: 0, ty: 0, k: 0.6 },
    shot: 'wide', directed: false, snapped: false,
    pointer: { x: 0, y: 0, sx: 0, sy: 0 }, shake: 0, still: false,
    expressions: {} as Record<string, string>
  }

  constructor() {
    super()
    this.root = this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    this.alive = true
    this.root.innerHTML = `<style>${CSS}</style><svg class="hs-root lml-set" xmlns="http://www.w3.org/2000/svg"></svg><div class="vignette"></div><div class="scan"></div><div class="bottom"></div>`
    this.svg = this.root.querySelector('svg')!
    this.bottom = this.root.querySelector('.bottom')!
    this.runtime = {
      q: (selector) => this.svg.querySelector(selector) as SVGElement | null,
      qa: (selector) => Array.from(this.svg.querySelectorAll(selector)) as SVGElement[],
      later: (fn, ms) => { this.timers.push(window.setTimeout(() => { if (this.alive) fn() }, ms)) },
      shake: (amount) => { this.engine.shake = Math.max(this.engine.shake, amount) },
      scan: () => { const scan = this.root.querySelector<HTMLElement>('.scan')!; scan.classList.remove('run'); void scan.offsetWidth; scan.classList.add('run') },
      memo: {},
      interpolate: (text) => this.session?.interpolate(text) ?? text,
      evaluate: (source, overrides = {}) => this.session ? this.session.evaluateWith(source, overrides) : NaN
    }
    new ResizeObserver(() => this.resize()).observe(this)
    new ResizeObserver(() => { this.engine.bottomInset = this.bottom.offsetHeight + 24; this.fit(false) }).observe(this.bottom)
    this.bindInput()
    this.startLoops()
    void this.loadFromAttributes()
  }

  disconnectedCallback() {
    this.alive = false
    cancelAnimationFrame(this.frameId)
    this.timers.forEach((timer) => clearTimeout(timer))
    clearInterval(this.typingTimer)
  }

  attributeChangedCallback(name: string, previous: string | null, value: string | null) {
    if (!this.isConnected || previous === value) return
    if (name === 'style-pack') this.buildSet()
    else void this.loadFromAttributes()
  }

  // Load a lesson directly (screenplay text + world catalog).
  load(source: string, world: World) {
    const result = compile(source, world)
    if (!result.ok) {
      this.root.querySelector('.errors')?.remove()
      const pre = document.createElement('pre')
      pre.className = 'errors'
      pre.textContent = formatDiagnostics(result.diagnostics)
      this.root.appendChild(pre)
      this.dispatchEvent(new CustomEvent('lml-error', { detail: result.diagnostics }))
      return
    }
    this.world = world
    this.session = new LessonSession(result.lesson)
    this.ui = result.lesson.learnerLanguage?.startsWith('zh') ? UI.zh : UI.en
    this.engine.directed = false
    this.engine.snapped = false
    this.buildSet()
    this.render()
  }

  // Preview hooks (the MCP render_preview tool): move ahead, then freeze
  // motion so a screenshot shows exactly what a learner would settle on.
  seek(steps: number) {
    const session = this.session
    if (!session) return
    for (let i = 0; i < steps; i++) {
      // A preview walks through interactions with the correct answer.
      const frame = session.frame
      if (frame.kind === 'interaction' && !frame.solved) {
        if (frame.step.component === 'lessonml:cloze') session.type(frame.step.props.answer || '')
        else if (frame.step.component === 'lessonml:speak') session.spoke(true)
        else if (frame.step.component === 'lessonml:write') session.reviewed(true)
        else if (frame.step.component === 'lessonml:numeric') session.numeric(`${session.evaluate(frame.step.props.answer)} ${frame.step.props.unit || ''}`)
        else if (frame.step.component === 'lessonml:explore') {
          const found = session.findGoal()
          if (found) for (const [name, value] of Object.entries(found)) if (session.frame.kind === 'interaction' && !session.frame.solved) session.adjust(name, value)
        }
        else session.choose(Math.max(0, frame.step.options.findIndex((option) => option.correct)))
      }
      if (!session.next()) break
    }
    this.render()
  }

  settle() {
    this.typing?.done()
    const e = this.engine
    e.still = true
    e.shake = 0
    this.svg.classList.add('still')
    Object.assign(e.camera, { s: e.camera.ts, x: e.camera.tx, y: e.camera.ty })
    this.set?.settle?.(this.runtime)
  }

  // Host-driven navigation (controls="host"); also usable in standalone mode.
  next() { this.go(1) }
  back() { this.go(-1) }

  // What is on screen, in words (for tools that cannot see).
  describeFrame() {
    const frame = this.session?.frame
    if (!frame) return null
    const base = { kind: frame.kind, camera: frame.stage.camera, screen: frame.stage.screen, effects: frame.stage.effects, expressions: frame.stage.expressions }
    const live = (text?: string) => (text ? this.session!.interpolate(text) : text)
    // words: the target words on screen, so a host can show them (frequency map, word drawer).
    if (frame.kind === 'line') return { ...base, speaker: frame.step.speaker, text: live(frame.step.text), translation: frame.step.translation ? live(frame.step.translation) : undefined, words: frame.step.words }
    if (frame.kind === 'interaction') return { ...base, component: frame.step.component, id: frame.step.id, prompt: live(frame.step.props.prompt), solved: frame.solved, state: { ...this.session!.state }, words: frame.step.words }
    return base
  }

  // The sense of a term in this lesson: the lesson's glossary, then the world's.
  gloss(term: string): (GlossEntry & { target: string }) | null {
    const lesson = this.session?.lesson
    if (!lesson) return null
    const target = toTargetId(term, lesson.language)
    const entry = lesson.glossary[target] || this.world?.glossary?.[target]
    return entry ? { target, ...entry } : { target, gloss: '' }
  }

  private async loadFromAttributes() {
    const src = this.getAttribute('src')
    const worldUrl = this.getAttribute('world')
    if (!src || !worldUrl) return
    const [source, world] = await Promise.all([
      fetch(new URL(src, document.baseURI)).then((response) => response.text()),
      fetch(new URL(worldUrl, document.baseURI)).then((response) => response.json())
    ])
    this.load(source, world as World)
  }

  // ── Set ───────────────────────────────────────────────────────────────────
  private buildSet() {
    if (!this.session || !this.world) return
    const world = this.world
    const placeKey = this.session.frame.stage.place.split(':')[1]
    const place = world.places[placeKey]
    const set = getSet(place?.set)
    if (!place || !set) {
      this.showErrors(`place @${this.session.frame.stage.place} has no playable set ("set": "${place?.set ?? ''}"). Registered sets: ${registeredSets().join(', ')}.`)
      return
    }
    this.set = set
    const style = STYLE_PACKS[this.getAttribute('style-pack') || 'anime-clean'] || STYLE_PACKS['anime-clean']
    this.svg.innerHTML = set.build({
      world,
      place,
      style,
      cast: (slot) => {
        const key = place.cast?.[slot]
        const entry = key ? world.characters[key] : undefined
        return entry ? { spec: entry.rig, name: entry.name } : undefined
      }
    })
    this.runtime.memo = {}
    this.engine.shot = this.engine.directed ? this.engine.shot : set.establishing
    this.resize()
    this.render()
  }

  private showErrors(message: string) {
    this.root.querySelector('.errors')?.remove()
    const pre = document.createElement('pre')
    pre.className = 'errors'
    pre.textContent = message
    this.root.appendChild(pre)
    this.dispatchEvent(new CustomEvent('lml-error', { detail: message }))
  }

  private q<T extends Element = SVGElement>(selector: string) { return this.svg.querySelector(selector) as T | null }
  private characters(key: string) { return Array.from(this.svg.querySelectorAll(`[data-character="${key}"]`)) }
  private keyOf(id: string | null) { return id ? id.split(':')[1] : null }

  // ── Camera ────────────────────────────────────────────────────────────────
  private resize() {
    this.engine.size = { w: this.clientWidth || 1, h: this.clientHeight || 1 }
    this.svg.setAttribute('viewBox', `0 0 ${this.engine.size.w} ${this.engine.size.h}`)
    this.fit(!this.engine.snapped)
    this.engine.snapped = true
  }

  private fit(snap: boolean) {
    const e = this.engine
    const shots = this.set?.shots
    if (!shots) return
    const top = 12
    const availableWidth = e.size.w - 16
    const availableHeight = Math.max(140, e.size.h - top - e.bottomInset)
    const portrait = availableWidth / availableHeight < 0.8
    const rect = (portrait ? this.set!.portraitShots?.[e.shot] : undefined) || shots[e.shot] || shots[this.set!.defaultShot]
    const s = Math.min(availableWidth / rect.w, availableHeight / rect.h)
    Object.assign(e.camera, { ts: s, tx: e.size.w / 2 - s * (rect.x + rect.w / 2), ty: top + availableHeight / 2 - s * (rect.y + rect.h / 2) })
    if (snap) Object.assign(e.camera, { s: e.camera.ts, x: e.camera.tx, y: e.camera.ty })
  }

  // ── Frame ─────────────────────────────────────────────────────────────────
  private render() {
    const session = this.session
    const set = this.set
    if (!session || !set || !this.svg.firstChild) return
    const frame = session.frame
    set.stage?.(frame, this.runtime)
    for (const [id, expression] of Object.entries(frame.stage.expressions)) {
      const key = this.keyOf(id)!
      this.engine.expressions[key] = expression
      if (this.talking !== key) this.characters(key).forEach((root) => setExpression(root, expression))
    }
    this.engine.shot = frame.stage.camera || set.defaultShot
    this.engine.camera.k = this.engine.directed ? 2.6 : 0.6
    this.engine.directed = true
    this.fit(false)
    set.surface?.(frame, this.runtime)
    this.renderBottom(frame)
    this.dispatchEvent(new CustomEvent('lml-frame', { detail: { index: frame.index, blocked: session.blocked, canGoBack: session.canGoBack, frame: this.describeFrame() } }))
  }

  private inScene(frame: Frame) { return Boolean(this.set?.hosts?.(frame)) }

  // ── Dialogue and interaction panel ────────────────────────────────────────
  private renderBottom(frame: Frame) {
    const ui = this.ui
    this.root.querySelector('.end')?.remove()
    this.bottom.innerHTML = ''
    if (frame.kind === 'end') {
      this.dispatchEvent(new CustomEvent('lml-end', { detail: { state: this.session?.state, evidence: this.session?.evidence } }))
      // A host app shows its own ending (a recap, the next episode).
      if (this.hostControls) return
      const end = document.createElement('div')
      end.className = 'end'
      end.innerHTML = `<h2>${ui.end}</h2><button type="button">${ui.replay}</button>`
      end.querySelector('button')!.onclick = () => { if (this.session) { this.session = new LessonSession(this.session.lesson); this.engine.directed = false; this.render() } }
      this.root.appendChild(end)
      return
    }
    if (frame.kind === 'interaction' && !this.inScene(frame)) this.bottom.appendChild(this.panelFor(frame))

    let line: LineStep | null = null
    let translation = ''
    let tag = ''
    let system = false
    if (frame.kind === 'line') {
      line = frame.step
      translation = line.translation || ''
    } else if (frame.feedback?.line || frame.feedback?.hint || frame.feedback?.direction) {
      const direction = frame.feedback.direction ? ui[frame.feedback.direction] : ''
      // Keep the task in view when the feedback is only a hint (e.g. a review note).
      const prompt = frame.step.props.prompt
      line = frame.feedback.line || { kind: 'line', line: 0, speaker: null, text: direction || prompt || '…', words: direction || !prompt ? [] : frame.step.words }
      translation = frame.feedback.hint || (frame.feedback.line ? direction : '') || line.translation || ''
    } else {
      const fallback = frame.step.component === 'lessonml:cloze' ? ui.fill : ''
      line = { kind: 'line', line: frame.step.line, speaker: null, text: frame.step.props.prompt || fallback, words: frame.step.props.prompt ? frame.step.words : [] }
      tag = frame.step.props.title || ui.move
    }
    line = { ...line, text: this.session!.interpolate(line.text) }
    translation = this.session!.interpolate(translation)
    if (line.speaker && this.world) {
      const character = this.world.characters[this.keyOf(line.speaker)!]
      tag = character?.name.toUpperCase() || ''
      system = Boolean(character?.system)
    }
    const box = document.createElement('div')
    box.className = `box${system ? ' system' : ''}${frame.kind === 'interaction' && translation ? ' open' : ''}`
    box.innerHTML = `<span class="tag"></span><p class="text"></p><p class="translation"></p><div class="foot"></div>`
    box.querySelector('.tag')!.textContent = tag
    box.querySelector('.translation')!.textContent = translation
    box.querySelector('.foot')!.textContent = translation && frame.kind === 'line' ? ui.tapForTranslation : ''
    box.onclick = (event) => {
      const word = (event.target as HTMLElement).closest('b')
      if (word) {
        const term = word.getAttribute('data-word') || ''
        this.dispatchEvent(new CustomEvent('lml-word', { detail: { word: term, ...this.gloss(term) } }))
        return
      }
      if (this.typing) this.typing.done()
      else if (translation) box.classList.toggle('open')
    }
    this.bottom.appendChild(box)
    this.typeLine(box.querySelector('.text')!, line, line.speaker ? this.keyOf(line.speaker) : null)
    if (this.hostControls) return
    const hint = document.createElement('button')
    hint.className = 'hint'
    hint.type = 'button'
    const blocked = this.session?.blocked
    hint.textContent = blocked ? (this.inScene(frame) ? ui.solveHere : ui.blocked) : ui.next
    hint.onclick = () => this.go(1)
    this.bottom.appendChild(hint)
  }

  private panelFor(frame: Extract<Frame, { kind: 'interaction' }>) {
    const session = this.session!
    const panel = document.createElement('div')
    panel.className = 'panel'
    const after = (_correct: boolean) => { this.emitAnswer(); this.render() }
    const step: InteractionStep = frame.step
    if (step.component === 'lessonml:cloze') {
      panel.innerHTML = `<div class="line"></div><div class="row"><input autocomplete="off" autocapitalize="off" spellcheck="false"><button class="act" type="button">${this.ui.check}</button></div>`
      panel.querySelector('.line')!.textContent = (step.props.line || '').replace('___', frame.solved ? step.props.answer : '_____')
      const input = panel.querySelector('input')!
      const submit = () => { if (!frame.solved && input.value.trim()) after(session.type(input.value).correct) }
      panel.querySelector('.act')!.addEventListener('click', submit)
      input.addEventListener('keydown', (event) => { event.stopPropagation(); if (event.key === 'Enter') submit() })
      if (frame.solved) input.disabled = true
      return panel
    }
    if (step.component === 'lessonml:speak') {
      const Recognition = (window as unknown as { SpeechRecognition?: new () => SpeechLike; webkitSpeechRecognition?: new () => SpeechLike }).SpeechRecognition
        || (window as unknown as { webkitSpeechRecognition?: new () => SpeechLike }).webkitSpeechRecognition
      const target = (step.props.target || '').toLowerCase()
      panel.innerHTML = `<div class="row"><button class="act" type="button">🎤 ${this.ui.say}</button></div><div class="row"><input placeholder="${this.ui.typeInstead}"><button class="act" type="button">${this.ui.check}</button></div>`
      const [sayButton, checkButton] = Array.from(panel.querySelectorAll<HTMLButtonElement>('.act'))
      const input = panel.querySelector('input')!
      if (!Recognition) sayButton.parentElement!.remove()
      sayButton.onclick = () => {
        if (!Recognition || frame.solved) return
        const recognition = new Recognition()
        recognition.lang = this.session?.lesson.language || 'en'
        sayButton.textContent = this.ui.listening
        recognition.onresult = (event) => after(session.spoke(event.results[0][0].transcript.toLowerCase().includes(target)).correct)
        recognition.onend = () => { sayButton.textContent = `🎤 ${this.ui.say}` }
        recognition.start()
      }
      const submit = () => { if (!frame.solved && input.value.trim()) after(session.spoke(input.value.toLowerCase().includes(target)).correct) }
      checkButton.onclick = submit
      input.addEventListener('keydown', (event) => { event.stopPropagation(); if (event.key === 'Enter') submit() })
      return panel
    }
    if (step.component === 'lessonml:numeric') {
      panel.innerHTML = `<div class="row"><input inputmode="decimal" autocomplete="off"><button class="act" type="button">${this.ui.check}</button></div>`
      const input = panel.querySelector('input')!
      input.placeholder = step.props.unit ? `… ${step.props.unit}` : '…'
      const submit = () => { if (!frame.solved && input.value.trim()) after(session.numeric(input.value).correct) }
      panel.querySelector('.act')!.addEventListener('click', submit)
      input.addEventListener('keydown', (event) => { event.stopPropagation(); if (event.key === 'Enter') submit() })
      if (frame.solved) input.disabled = true
      return panel
    }
    if (step.component === 'lessonml:explore') {
      for (const control of parseControls(step.props.controls || '').controls) {
        const row = document.createElement('label')
        row.className = 'slider'
        row.innerHTML = `<span class="name"></span><input type="range"><span class="value"></span>`
        row.querySelector('.name')!.textContent = control.name
        const range = row.querySelector('input')!
        Object.assign(range, { min: String(control.min), max: String(control.max), step: String(control.step), value: String(session.state[control.name] ?? control.min) })
        const value = row.querySelector('.value')!
        value.textContent = formatNumber(Number(range.value))
        range.disabled = frame.solved
        range.addEventListener('input', () => {
          if (session.frame.kind !== 'interaction' || session.frame.solved) return
          const result = session.adjust(control.name, Number(range.value))
          value.textContent = formatNumber(result.value)
          if (result.correct) { this.emitAnswer(); this.render(); return }
          this.refreshLive()
        })
        for (const type of ['touchstart', 'mousedown', 'pointerdown']) range.addEventListener(type, (event) => event.stopPropagation())
        panel.appendChild(row)
      }
      return panel
    }
    if (step.component === 'lessonml:write') {
      panel.innerHTML = `<textarea></textarea><div class="row" style="justify-content:flex-end"><button class="act" type="button">${this.ui.submit}</button></div>`
      const area = panel.querySelector('textarea')!
      const submitButton = panel.querySelector<HTMLButtonElement>('.act')!
      area.placeholder = this.ui.write
      area.addEventListener('keydown', (event) => event.stopPropagation())
      if (frame.solved) { area.disabled = true; submitButton.remove(); return panel }
      submitButton.onclick = async () => {
        const text = area.value.trim()
        if (!text) return
        submitButton.disabled = true
        submitButton.textContent = this.ui.reviewing
        const targets = (step.props.targets || '').split(',').map((target) => target.trim()).filter(Boolean)
        const verdict = await this.reviewer({ id: step.id, text, prompt: step.props.prompt || '', targets, minWords: Number(step.props.min_words || 0), language: session.lesson.language })
          .catch(() => ({ pass: false, feedback: 'Review failed; try again.' }))
        after(session.reviewed(verdict.pass, verdict.feedback).correct)
      }
      return panel
    }
    step.options.forEach((option, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `option${frame.misses.includes(index) ? ' wrong' : ''}${frame.solved && option.correct ? ' right' : ''}`
      button.textContent = option.text
      button.onclick = () => { if (!frame.solved) after(session.choose(index).correct) }
      panel.appendChild(button)
    })
    return panel
  }

  // Slider moved: redraw the set and live text without retyping the dialogue.
  private refreshLive() {
    const session = this.session
    if (!session || !this.set) return
    this.set.stage?.(session.frame, this.runtime)
    this.typing?.done()
    const frame = session.frame
    const text = this.root.querySelector('.box .text')
    if (frame.kind === 'interaction' && text && frame.step.props.prompt?.includes('{=')) text.textContent = session.interpolate(frame.step.props.prompt)
    this.dispatchEvent(new CustomEvent('lml-state', { detail: { ...session.state } }))
  }

  private emitAnswer() {
    const session = this.session
    if (!session) return
    const latest = session.evidence.filter((event) => event.at === session.frame.index)
    latest.forEach((event) => this.dispatchEvent(new CustomEvent('lml-evidence', { detail: event })))
    this.dispatchEvent(new CustomEvent('lml-state', { detail: { ...session.state } }))
  }

  private typeLine(target: HTMLElement, line: LineStep, speakerKey: string | null) {
    clearInterval(this.typingTimer)
    target.innerHTML = ''
    const chars: HTMLSpanElement[] = []
    const words = new Set(line.words)
    // Wrap target words; everything is pre-laid so the layout never jumps.
    const parts = line.text.split(/(\b[\w'-]+\b)/)
    for (const part of parts) {
      const lemma = part.toLowerCase()
      const isWord = words.has(lemma) || [...words].some((word) => lemma.startsWith(word.replace(/e$/, '')) && lemma.length - word.length <= 3 && word.length > 3)
      const host: HTMLElement = isWord ? Object.assign(document.createElement('b'), { textContent: '' }) : target
      if (isWord) { host.setAttribute('data-word', [...words].find((word) => lemma.startsWith(word.replace(/e$/, ''))) || lemma); target.appendChild(host) }
      for (const char of part) {
        const span = document.createElement('span')
        span.textContent = char
        span.className = 'h'
        host.appendChild(span)
        chars.push(span)
      }
    }
    let index = 0
    this.talking = speakerKey
    const done = () => {
      chars.forEach((char) => char.classList.remove('h'))
      clearInterval(this.typingTimer)
      this.typing = null
      if (this.talking) {
        const key = this.talking
        this.talking = null
        this.characters(key).forEach((root) => setExpression(root, this.engine.expressions[key] || 'neutral'))
      }
    }
    this.typing = { done }
    this.typingTimer = window.setInterval(() => {
      for (let n = 0; n < 2 && index < chars.length; n++) chars[index++].classList.remove('h')
      if (index >= chars.length) done()
    }, 26)
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  private go(direction: 1 | -1) {
    const session = this.session
    if (!session) return
    if (direction > 0) {
      if (this.typing) { this.typing.done(); return }
      if (!session.next()) {
        const hint = this.root.querySelector<HTMLElement>('.hint')
        hint?.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 300 })
        return
      }
    } else if (!session.back()) return
    this.render()
  }

  private bindInput() {
    if (this.hostControls) {
      this.svg.addEventListener('click', (event) => this.pickInScene(event))
      return
    }
    let start: { x: number; y: number } | null = null
    const fromEditable = (event: Event) => (event.composedPath()[0] as HTMLElement | undefined)?.closest?.('input, textarea')
    const down = (x: number, y: number) => { start = { x, y } }
    const up = (x: number, y: number) => {
      if (!start) return
      const dx = x - start.x, dy = y - start.y
      start = null
      if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) this.go(dy < 0 ? 1 : -1)
    }
    this.addEventListener('touchstart', (event) => { if (!fromEditable(event)) down(event.touches[0].clientX, event.touches[0].clientY) }, { passive: true })
    this.addEventListener('touchend', (event) => up(event.changedTouches[0].clientX, event.changedTouches[0].clientY))
    this.addEventListener('mousedown', (event) => { if (!fromEditable(event)) down(event.clientX, event.clientY) })
    this.addEventListener('mouseup', (event) => up(event.clientX, event.clientY))
    let accumulated = 0, lastNavigation = -1e9
    this.addEventListener('wheel', (event) => {
      const now = performance.now()
      if (now - lastNavigation < 700) { accumulated = 0; return }
      accumulated = Math.sign(event.deltaY) === Math.sign(accumulated) ? accumulated + event.deltaY : event.deltaY
      if (Math.abs(accumulated) >= 60) { this.go(accumulated > 0 ? 1 : -1); accumulated = 0; lastNavigation = now }
    }, { passive: true })
    this.tabIndex = 0
    this.addEventListener('keydown', (event) => {
      if (fromEditable(event)) return
      if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(event.key)) { event.preventDefault(); this.go(1) }
      if (['ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); this.go(-1) }
    })
    this.addEventListener('pointermove', (event) => {
      const box = this.getBoundingClientRect()
      this.engine.pointer.x = ((event.clientX - box.left) / box.width - 0.5) * 2
      this.engine.pointer.y = ((event.clientY - box.top) / box.height - 0.5) * 2
    })
    this.svg.addEventListener('click', (event) => this.pickInScene(event))
  }

  // An option the set drew inside the scene ([data-i] under .opt).
  private pickInScene(event: Event) {
    const option = (event.target as Element).closest('.opt') as SVGElement | null
    const session = this.session
    if (!option || !session || session.frame.kind !== 'interaction' || session.frame.solved) return
    session.choose(Number(option.dataset.i))
    this.emitAnswer()
    if (session.frame.kind === 'interaction' && !session.frame.solved) this.runtime.shake(5)
    this.render()
  }

  // ── Loops: blink, lip flaps, breathing, camera, rain ─────────────────────
  private startLoops() {
    const blink = () => {
      if (!this.alive) return
      const roots = Array.from(this.svg.querySelectorAll('[data-character]'))
      roots.forEach((root) => setEyes(root, false))
      this.timers.push(window.setTimeout(() => roots.forEach((root) => setEyes(root, true)), 110))
      this.timers.push(window.setTimeout(blink, 2200 + Math.random() * 3000))
    }
    this.timers.push(window.setTimeout(blink, 1200))
    let open = false
    const flap = () => {
      if (!this.alive) return
      if (this.talking) {
        open = !open
        const key = this.talking
        this.characters(key).forEach((root) => setMouth(root, open ? 'talk' : (this.engine.expressions[key] || 'neutral')))
      }
      this.timers.push(window.setTimeout(flap, 70 + Math.random() * 70))
    }
    flap()
    let last = performance.now()
    const frame = (now: number) => {
      if (!this.alive) return
      const e = this.engine
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = now / 1000
      const c = e.camera
      const a = 1 - Math.exp(-dt * c.k)
      c.s += (c.ts - c.s) * a; c.x += (c.tx - c.x) * a; c.y += (c.ty - c.y) * a
      e.pointer.sx += (e.pointer.x - e.pointer.sx) * 0.06
      e.pointer.sy += (e.pointer.y - e.pointer.sy) * 0.06
      e.shake *= Math.pow(0.02, dt)
      const drift = e.still ? 0 : 1
      const hx = drift * (Math.sin(t * 0.37) * 3 + Math.sin(t * 0.91) * 1.2) + (Math.random() - 0.5) * e.shake
      const hy = drift * Math.cos(t * 0.29) * 2.4 + (Math.random() - 0.5) * e.shake
      this.q('[data-camera]')?.setAttribute('transform', `translate(${(c.x + hx).toFixed(2)},${(c.y + hy).toFixed(2)}) scale(${c.s.toFixed(4)})`)
      this.svg.querySelectorAll<SVGElement>('.px').forEach((layer) => {
        const f = Number(layer.dataset.f)
        layer.setAttribute('transform', `translate(${(-e.pointer.sx * 26 * (f - 0.85)).toFixed(2)},${(-e.pointer.sy * 14 * (f - 0.85)).toFixed(2)})`)
      })
      this.svg.querySelectorAll<SVGElement>('[data-character]').forEach((root, i) => {
        const key = root.dataset.character!
        const breath = Math.sin(t * 1.7 + i * 1.3)
        const expression = e.expressions[key] || 'neutral'
        const head = `translate(0,${(breath * 1.3 + (expression === 'surprised' ? -4 : 0)).toFixed(2)}) rotate(${((TILT[expression] || 0) + Math.sin(t * 0.6 + i) * 0.8).toFixed(2)} 200 300)`
        root.querySelector('.bd')?.setAttribute('transform', `translate(0,${(breath * 1.8).toFixed(2)})`)
        root.querySelector('.nk')?.setAttribute('transform', `translate(0,${(breath * 1.5).toFixed(2)})`)
        root.querySelector('.hb')?.setAttribute('transform', head)
        root.querySelector('.hf')?.setAttribute('transform', head)
        root.querySelectorAll<SVGElement>('.lock').forEach((lock, n) => lock.setAttribute('transform', `rotate(${(Math.sin(t * 1.3 + n + i) * 1.4).toFixed(2)} ${lock.dataset.pivot})`))
      })
      this.set?.tick?.(this.runtime, dt, t)
      this.frameId = requestAnimationFrame(frame)
    }
    this.frameId = requestAnimationFrame(frame)
  }
}

interface SpeechLike {
  lang: string
  start(): void
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
}

if (typeof customElements !== 'undefined' && !customElements.get('lml-scene')) customElements.define('lml-scene', LmlSceneElement)
