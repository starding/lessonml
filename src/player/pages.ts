// <lml-pages>: plays a lesson's illustrated pages (SPEC.md §11).
//
// A page is a picture the learner explores: pinch and drag to look around, tap
// a thing to learn its word. "Tour" reads the page's lines as subtitles while
// the camera frames what each line talks about. Words that cannot be drawn
// live in the text and are glossed on tap. A lessonml:find interaction asks
// the learner to find things in the picture and is the page's evidence.
//
// Usage:
//   <lml-pages src="episode.lml" world="world.json"></lml-pages>
//   el.frontier = ['kettle', 'rely']             // highlight the learner's frontier
//   el.speak = (text) => myTts(text)              // optional: host-provided voice
// Events: lml-word {word, target, source, page}, lml-evidence {facet, target,
// interaction}, lml-page {index, id}, lml-end, lml-error (diagnostics).

import { compile, formatDiagnostics } from '../validate.js'
import { toTargetId, type World } from '../catalog.js'
import type { InteractionStep, Lesson, LineStep, Page, Spot, Step } from '../ir.js'

type Point = [number, number]
type Speak = (text: string, kind: 'word' | 'line') => Promise<void> | void

const UI = {
  zh: { tour: '导览', stop: '停', next: '下一页 ›', prev: '‹', end: '完', found: '已找到', notThis: '不是这个', foundIt: '找到了', translate: '中', frontier: '你的前沿词', done: '这一页讲完了', start: '▶ 开始导览', explore: '自己点点看还有什么' },
  en: { tour: 'Tour', stop: 'Stop', next: 'Next page ›', prev: '‹', end: 'The end', found: 'Found', notThis: 'Not this one', foundIt: 'Found it', translate: 'Tr', frontier: 'on your frontier', done: 'End of this page', start: '▶ Start the tour', explore: 'Tap around to find more' }
}

const STYLE = `
:host { position: relative; display: block; width: 100%; height: 100%; overflow: hidden; background: #0d1416; color: #f5efe4;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif; --lml-bottom-gap: 0px; }
.stage { position: absolute; inset: 0; touch-action: none; overflow: hidden; cursor: grab; }
.world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.world img, .world svg { position: absolute; left: 0; top: 0; display: block; user-select: none; -webkit-user-drag: none; }
.hot { fill: transparent; }
.hot.flash { fill: rgba(255, 220, 160, .28); stroke: #ffe1a8; stroke-width: 2; vector-effect: non-scaling-stroke; }
:host([debug]) .hot { fill: rgba(255, 0, 255, .12); stroke: #f0f; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.mark { pointer-events: none; }
.mark.found { fill: #ff9a3c; stroke: #fff4e0; }
.mark.frontier { fill: none; stroke: #7fe0d4; }
.bar { position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: center; gap: 8px; pointer-events: none;
  padding: calc(env(safe-area-inset-top) + 10px) 14px 18px; background: linear-gradient(rgba(8, 14, 16, .75), rgba(8, 14, 16, 0)); }
.bar .title { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar .title small { font-weight: 400; opacity: .7; margin-left: 6px; }
.pill { pointer-events: auto; flex: none; white-space: nowrap; border: 1px solid rgba(245, 239, 228, .25); background: rgba(8, 14, 16, .55); color: inherit;
  border-radius: 999px; padding: 6px 11px; font: inherit; font-size: 13px; cursor: pointer; }
.pill.on { background: rgba(255, 154, 60, .2); border-color: rgba(255, 154, 60, .6); }
.pill[disabled] { opacity: .35; }
.sub { position: absolute; left: 0; right: 0; bottom: 0; padding: 28px 20px calc(env(safe-area-inset-bottom) + var(--lml-bottom-gap) + 20px);
  background: linear-gradient(rgba(6, 10, 12, 0), rgba(6, 10, 12, .85) 36%); font-size: 18px; line-height: 1.6; text-shadow: 0 1px 6px rgba(0, 0, 0, .6);
  opacity: 0; transform: translateY(12px); pointer-events: none; transition: opacity .3s, transform .3s; }
.sub.show { opacity: 1; transform: none; pointer-events: auto; }
.sub .meta { font-size: 11px; opacity: .6; margin-bottom: 6px; letter-spacing: .05em; }
.sub .who { color: #ffd9b0; font-weight: 600; margin-right: 6px; }
.sub .tr { margin-top: 4px; font-size: 13px; color: #ffd9b0; opacity: .85; }
.sub .big { font-size: 16px; padding: 10px 18px; }
.lk { color: #fff; text-decoration: underline; text-decoration-color: rgba(245, 239, 228, .5); text-underline-offset: 4px; text-decoration-thickness: 1.5px; cursor: pointer; }
.lk.frontier, .gl.frontier { text-decoration-color: #7fe0d4; }
.gl { text-decoration: underline dotted; text-decoration-color: rgba(245, 239, 228, .55); text-underline-offset: 4px; cursor: pointer; }
.gl.frontier { color: #e6fbf7; }
.card { position: absolute; left: 12px; right: 12px; bottom: calc(env(safe-area-inset-bottom) + var(--lml-bottom-gap) + 12px); background: rgba(14, 22, 24, .95);
  border: 1px solid rgba(255, 255, 255, .08); border-radius: 18px; padding: 16px 18px 18px; transform: translateY(150%); transition: transform .28s cubic-bezier(.2, .8, .2, 1); }
.card.open { transform: none; }
.card .w { font-size: 28px; font-weight: 700; }
.card .tag { float: right; font-size: 11px; color: #7fe0d4; border: 1px solid rgba(127, 224, 212, .4); border-radius: 999px; padding: 2px 8px; }
.card .g { margin-top: 2px; font-size: 15px; color: #ffd9b0; }
.card .ctx { margin-top: 10px; font-size: 15px; line-height: 1.55; opacity: .92; }
.card .ctx b { color: #ff9a3c; font-weight: 600; }
.ring { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; border: 2px solid rgba(245, 239, 228, .6); opacity: 0; pointer-events: none; }
.ring.go { animation: ring .45s ease-out; }
@keyframes ring { from { transform: scale(.4); opacity: .9; } to { transform: scale(1.4); opacity: 0; } }
.toast { position: absolute; left: 50%; top: calc(env(safe-area-inset-top) + 58px); transform: translateX(-50%); background: rgba(8, 14, 16, .82);
  border-radius: 999px; padding: 6px 14px; font-size: 13px; opacity: 0; transition: opacity .2s; pointer-events: none; white-space: nowrap; }
.toast.show { opacity: 1; }
.errors { position: absolute; inset: 0; margin: 0; padding: 16px; overflow: auto; color: #ff9d9d; font: 12px/1.5 ui-monospace, Menlo, monospace; white-space: pre-wrap; }
`

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

const inside = ([px, py]: Point, poly: Point[]) => {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

// The lines and finds of a page in order (branches are flattened: pages have no state).
const flatten = (steps: Step[]): (LineStep | InteractionStep)[] => steps.flatMap((step) =>
  step.kind === 'line' || step.kind === 'interaction' ? [step] : step.kind === 'branch' ? flatten(step.steps) : [])

const defaultSpeak: Speak = (text) => new Promise((resolve) => {
  try {
    if (typeof speechSynthesis === 'undefined') throw new Error('no speech')
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = 0.95
    let started = false
    utterance.onstart = () => { started = true }
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
    // No engine (some Android ROMs): fall back to reading time.
    setTimeout(() => { if (!started) resolve() }, 1500 + text.split(/\s+/).length * 330)
  } catch {
    setTimeout(resolve, 1200 + text.split(/\s+/).length * 330)
  }
})

export class LmlPagesElement extends HTMLElement {
  static observedAttributes = ['src', 'world']

  private root: ShadowRoot
  private lesson: Lesson | null = null
  private world: World | null = null
  private base = ''
  private index = 0
  private cam = { s: 1, x: 0, y: 0 }
  private insetBottom = 0
  private tween = 0
  private touring = false
  private tourStep = -1
  private finding: { step: InteractionStep; targets: string[]; found: Set<string> } | null = null
  private found = new Set<string>()
  private translations = false
  private frontierSet = new Set<string>()
  private ui = UI.zh
  private pointers = new Map<number, { x: number; y: number }>()
  private gesture: null | { kind: 'pan' | 'pinch'; sx: number; sy: number; d: number; mx: number; my: number; cam: { s: number; x: number; y: number }; t: number; moved: boolean } = null
  private lastTap = { t: 0, x: 0, y: 0 }
  private toastTimer = 0
  private resizeObserver: ResizeObserver | null = null

  // Host hooks.
  speak: Speak = defaultSpeak

  constructor() {
    super()
    this.root = this.attachShadow({ mode: 'open' })
  }

  set frontier(words: Iterable<string>) {
    this.frontierSet = new Set(Array.from(words, (word) => word.trim().toLowerCase()))
    if (this.lesson) { this.drawMarks(); this.renderSubtitle() }
  }
  get frontier() { return [...this.frontierSet] }
  get page(): Page | null { return this.lesson?.pages[this.index] ?? null }
  get pageIndex() { return this.index }

  connectedCallback() {
    this.resizeObserver = new ResizeObserver(() => { if (this.page) { this.cam = this.clamp(this.cam); this.apply() } })
    this.resizeObserver.observe(this)
    void this.loadFromAttributes()
  }
  disconnectedCallback() {
    this.resizeObserver?.disconnect()
    cancelAnimationFrame(this.tween)
    this.stopTour()
  }
  attributeChangedCallback(_: string, previous: string | null, value: string | null) {
    if (this.isConnected && previous !== value) void this.loadFromAttributes()
  }

  private async loadFromAttributes() {
    const src = this.getAttribute('src')
    if (!src) return
    const srcUrl = new URL(src, document.baseURI)
    const worldUrl = this.getAttribute('world')
    const [source, world] = await Promise.all([
      fetch(srcUrl).then((response) => response.text()),
      worldUrl ? fetch(new URL(worldUrl, document.baseURI)).then((response) => response.json()) : Promise.resolve(null)
    ])
    this.load(source, world as World | null, srcUrl.href)
  }

  // Load a lesson directly. `base` resolves image paths (defaults to the document).
  load(source: string, world: World | null, base = document.baseURI) {
    const namespace = source.match(/^lesson:\s*([a-z0-9-]+):/m)?.[1] || 'pages'
    const resolvedWorld: World = world || { namespace, title: '', characters: {}, places: {} }
    const result = compile(source, resolvedWorld)
    if (!result.ok || result.lesson.pages.length === 0) {
      const diagnostics = result.lesson.pages.length ? result.diagnostics : [...result.diagnostics, { line: 1, code: 'no-pages', message: 'this lesson has no "# page" to show.' }]
      this.root.innerHTML = `<style>${STYLE}</style><pre class="errors"></pre>`
      this.root.querySelector('.errors')!.textContent = formatDiagnostics(diagnostics)
      this.dispatchEvent(new CustomEvent('lml-error', { detail: diagnostics }))
      return
    }
    this.lesson = result.lesson
    this.world = resolvedWorld
    this.base = base
    this.ui = result.lesson.learnerLanguage && !result.lesson.learnerLanguage.startsWith('zh') ? UI.en : UI.zh
    this.goto(Number(this.getAttribute('page')) || 0)
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  goto(index: number) {
    if (!this.lesson) return
    this.stopTour()
    this.index = Math.max(0, Math.min(this.lesson.pages.length - 1, index))
    this.found = new Set()
    this.build()
    this.dispatchEvent(new CustomEvent('lml-page', { detail: { index: this.index, id: this.page!.id } }))
  }
  next() { if (this.lesson && this.index < this.lesson.pages.length - 1) this.goto(this.index + 1) }
  prev() { if (this.index > 0) this.goto(this.index - 1) }

  private build() {
    const page = this.page!
    const { width, height } = page.image
    const pages = this.lesson!.pages.length
    this.root.innerHTML = `<style>${STYLE}</style>
      <div class="stage"><div class="world" style="width:${width}px;height:${height}px">
        <img alt="" draggable="false" width="${width}" height="${height}">
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g class="hots"></g><g class="marks"></g></svg>
      </div></div>
      <div class="bar">
        <div class="title"></div>
        <button class="pill" data-act="tour"></button>
        <button class="pill" data-act="tr">${this.ui.translate}</button>
        <button class="pill" data-act="prev" ${this.index === 0 ? 'disabled' : ''}>${this.ui.prev}</button>
        <button class="pill" data-act="next" ${this.index >= pages - 1 ? 'disabled' : ''}>›</button>
      </div>
      <div class="ring"></div><div class="toast"></div>
      <div class="sub"></div>
      <div class="card"><span class="tag">${this.ui.frontier}</span><div class="w"></div><div class="g"></div><div class="ctx"></div></div>`
    const title = this.root.querySelector('.title')!
    title.textContent = this.lesson!.id.split(':')[1] || this.lesson!.id
    title.insertAdjacentHTML('beforeend', `<small>${this.index + 1} / ${pages}</small>`)
    this.root.querySelector('img')!.src = new URL(page.image.src, this.base).href
    this.root.querySelector('.tr')?.classList.toggle('on', this.translations)
    this.$('[data-act=tr]').classList.toggle('on', this.translations)
    const hots = this.root.querySelector('.hots')!
    hots.innerHTML = page.spots.map((spot) => spot.shapes.map((shape) =>
      `<polygon class="hot" data-spot="${spot.id}" points="${shape.map((p) => p.join(',')).join(' ')}"></polygon>`).join('')).join('')
    this.updateTourButton()
    this.bind()
    this.home()
    this.drawMarks()
  }

  private $<T extends Element = HTMLElement>(selector: string) { return this.root.querySelector(selector) as unknown as T }

  private bind() {
    const stage = this.$('.stage')
    stage.addEventListener('pointerdown', (e) => this.onDown(e))
    stage.addEventListener('pointermove', (e) => this.onMove(e))
    stage.addEventListener('pointerup', (e) => this.onUp(e))
    stage.addEventListener('pointercancel', (e) => this.onUp(e))
    stage.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, this.cam.s * Math.exp(-e.deltaY * 0.0015)); this.apply() }, { passive: false })
    this.$('.bar').addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
      if (act === 'tour') this.touring ? this.stopTour() : this.startTour()
      else if (act === 'tr') { this.translations = !this.translations; this.$('[data-act=tr]').classList.toggle('on', this.translations); this.renderSubtitle() }
      else if (act === 'prev') this.prev()
      else if (act === 'next') this.next()
    })
    this.$('.sub').addEventListener('click', (e) => this.onTextTap(e))
    this.$('.card').addEventListener('click', () => { const word = this.$('.card .w').textContent; if (word) void this.say(word, 'word') })
  }

  // ── Camera ──────────────────────────────────────────────────────────────────
  private get viewW() { return this.clientWidth || 1 }
  private get viewH() { return this.clientHeight || 1 }
  private minScale() { const { width, height } = this.page!.image; return Math.max(this.viewW / width, this.viewH / height) }
  private maxScale() { return Math.max(this.minScale() * 3, 1.5) }
  private focusY() { return (64 + this.viewH - this.insetBottom) / 2 }
  private clamp(c: { s: number; x: number; y: number }) {
    const { width, height } = this.page!.image
    const s = Math.min(this.maxScale(), Math.max(this.minScale(), c.s))
    return { s, x: Math.min(0, Math.max(this.viewW - width * s, c.x)), y: Math.min(0, Math.max(this.viewH - this.insetBottom - height * s, c.y)) }
  }
  private apply() {
    const world = this.$('.world')
    if (!world) return
    world.style.transform = `translate3d(${this.cam.x}px, ${this.cam.y}px, 0) scale(${this.cam.s})`
    const k = 1 / this.cam.s
    this.root.querySelectorAll<SVGCircleElement>('.mark').forEach((mark) => {
      const found = mark.classList.contains('found')
      mark.setAttribute('r', String((found ? 4.5 : 6) * k))
      mark.setAttribute('stroke-width', String(1.6 * k))
    })
  }
  private home() {
    const s = this.minScale(), { width, height } = this.page!.image
    this.cam = this.clamp({ s, x: (this.viewW - width * s) / 2, y: (this.viewH - height * s) / 2 })
    this.apply()
  }
  private zoomAt(px: number, py: number, s: number) {
    const wx = (px - this.cam.x) / this.cam.s, wy = (py - this.cam.y) / this.cam.s
    this.cam = this.clamp({ s, x: px - wx * s, y: py - wy * s })
  }
  private flyTo(wx: number, wy: number, s: number, duration = 450) {
    cancelAnimationFrame(this.tween)
    const from = { ...this.cam }
    const to = this.clamp({ s, x: this.viewW / 2 - wx * s, y: this.focusY() - wy * s })
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration), e = 1 - Math.pow(1 - k, 3)
      this.cam = { s: from.s + (to.s - from.s) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }
      this.apply()
      if (k < 1) this.tween = requestAnimationFrame(step)
    }
    this.tween = requestAnimationFrame(step)
  }
  // Frame a set of spots (their bounding box) in the free part of the view.
  private frame(ids: string[], duration = 800) {
    const spots = ids.map((id) => this.spot(id)).filter((spot): spot is Spot => Boolean(spot))
    if (!spots.length) return
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
    for (const spot of spots) for (const shape of spot.shapes) for (const [x, y] of shape) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y) }
    const free = this.viewH - this.insetBottom - 64
    const s = Math.min(this.maxScale(), Math.max(this.minScale(), Math.min(this.viewW * 0.8 / (x2 - x1), free * 0.75 / (y2 - y1))))
    this.flyTo((x1 + x2) / 2, (y1 + y2) / 2, s, duration)
  }

  // ── Gestures ────────────────────────────────────────────────────────────────
  private local(e: PointerEvent) { const r = this.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  private onDown(e: PointerEvent) {
    cancelAnimationFrame(this.tween)
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* synthetic events */ }
    const p = this.local(e)
    this.pointers.set(e.pointerId, p)
    if (this.pointers.size === 1) this.gesture = { kind: 'pan', sx: p.x, sy: p.y, d: 0, mx: 0, my: 0, cam: { ...this.cam }, t: performance.now(), moved: false }
    else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      this.gesture = { kind: 'pinch', sx: 0, sy: 0, d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cam: { ...this.cam }, t: 0, moved: true }
    }
  }
  private onMove(e: PointerEvent) {
    if (!this.pointers.has(e.pointerId) || !this.gesture) return
    const p = this.local(e)
    this.pointers.set(e.pointerId, p)
    const g = this.gesture
    if (g.kind === 'pan' && this.pointers.size === 1) {
      const dx = p.x - g.sx, dy = p.y - g.sy
      if (Math.hypot(dx, dy) > 12) g.moved = true
      if (g.moved) { this.cam = this.clamp({ s: g.cam.s, x: g.cam.x + dx, y: g.cam.y + dy }); this.apply() }
    } else if (g.kind === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      const s = g.cam.s * Math.hypot(a.x - b.x, a.y - b.y) / g.d
      const wx = (g.mx - g.cam.x) / g.cam.s, wy = (g.my - g.cam.y) / g.cam.s
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      this.cam = this.clamp({ s, x: mx - wx * s, y: my - wy * s })
      this.apply()
    }
  }
  private onUp(e: PointerEvent) {
    if (!this.pointers.has(e.pointerId)) return
    const p = this.local(e)
    this.pointers.delete(e.pointerId)
    const g = this.gesture
    if (g?.kind === 'pan' && !g.moved && performance.now() - g.t < 600 && e.type === 'pointerup') {
      const now = performance.now()
      if (now - this.lastTap.t < 280 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 30) {
        this.lastTap.t = 0
        const s = Math.min(this.maxScale(), this.cam.s * 2)
        this.flyTo((p.x - this.cam.x) / this.cam.s, (p.y - this.cam.y) / this.cam.s, s)
      } else {
        this.lastTap = { t: now, x: p.x, y: p.y }
        this.tap(p.x, p.y)
      }
    }
    if (this.pointers.size === 0) this.gesture = null
    else if (this.pointers.size === 1) { const [q] = [...this.pointers.values()]; this.gesture = { kind: 'pan', sx: q.x, sy: q.y, d: 0, mx: 0, my: 0, cam: { ...this.cam }, t: 0, moved: true } }
  }

  // Geometry in image pixels; topmost spot wins; a little slack for small things.
  private hitAt(x: number, y: number): Spot | null {
    const spots = this.page!.spots
    for (const r of [0, 10, 18]) {
      for (const [dx, dy] of r ? [[r, 0], [-r, 0], [0, r], [0, -r]] : [[0, 0]]) {
        const point: Point = [(x + dx - this.cam.x) / this.cam.s, (y + dy - this.cam.y) / this.cam.s]
        for (let i = spots.length - 1; i >= 0; i--) if (spots[i].shapes.some((shape) => inside(point, shape))) return spots[i]
      }
    }
    return null
  }

  // ── Explore ─────────────────────────────────────────────────────────────────
  private tap(x: number, y: number) {
    const ring = this.$('.ring')
    ring.style.left = `${x}px`; ring.style.top = `${y}px`
    ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go')
    const spot = this.hitAt(x, y)
    if (this.finding) { this.findTap(spot); return }
    if (!spot) { this.$('.card').classList.remove('open'); return }
    if (this.touring) this.stopTour()
    this.openCard(spot)
  }

  private openCard(spot: Spot) {
    this.flash(spot)
    this.markFound(spot)
    const card = this.$('.card')
    card.querySelector('.w')!.textContent = spot.word
    card.querySelector('.g')!.textContent = this.gloss(spot.word)
    const context = flatten(this.page!.steps).find((step): step is LineStep => step.kind === 'line' && step.words.includes(spot.word))
    card.querySelector('.ctx')!.innerHTML = context ? this.lineHtml(context, true) : ''
    ;(card.querySelector('.tag') as HTMLElement).style.display = this.frontierSet.has(spot.word) ? '' : 'none'
    card.classList.add('open')
    this.emitWord(spot.word, 'spot')
    void this.say(spot.word, 'word')
  }

  private markFound(spot: Spot) {
    this.found.add(spot.id)
    this.drawMarks()
  }
  private drawMarks() {
    const page = this.page
    const marks = this.root.querySelector('.marks')
    if (!page || !marks) return
    marks.innerHTML = page.spots.map((spot) => {
      const found = this.found.has(spot.id)
      if (!found && !this.frontierSet.has(spot.word)) return ''
      const pts = spot.shapes[0], cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length
      return `<circle class="mark ${found ? 'found' : 'frontier'}" cx="${cx}" cy="${cy}"></circle>`
    }).join('')
    this.apply()
  }
  private flash(spot: Spot, ms = 900) {
    this.root.querySelectorAll(`.hot[data-spot="${spot.id}"]`).forEach((el) => { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), ms) })
  }
  private spot(id: string) { return this.page?.spots.find((spot) => spot.id === id) }
  private spotForWord(word: string) { return this.page?.spots.find((spot) => spot.word === word) }
  private gloss(word: string) {
    const lesson = this.lesson!, target = toTargetId(word, lesson.language)
    return (lesson.glossary[target] || this.world?.glossary?.[target])?.gloss || ''
  }
  private emitWord(word: string, source: 'spot' | 'text') {
    this.dispatchEvent(new CustomEvent('lml-word', { detail: { word, target: toTargetId(word, this.lesson!.language), source, page: this.page!.id } }))
  }
  private toast(text: string) {
    const toast = this.$('.toast')
    toast.textContent = text
    toast.classList.add('show')
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1400)
  }
  private async say(text: string, kind: 'word' | 'line') {
    try { await this.speak(text, kind) } catch { /* the host's voice failed; the text is still on screen */ }
  }

  // ── Text ────────────────────────────────────────────────────────────────────
  // A line with its marks wrapped: words with a spot link to the picture; the
  // rest are glossed in place.
  private lineHtml(step: LineStep, plain = false) {
    let html = '', cursor = 0
    const text = step.text
    for (const mark of step.marks || []) {
      const at = text.indexOf(mark.surface, cursor)
      if (at < 0) continue
      html += escapeHtml(text.slice(cursor, at))
      const frontier = this.frontierSet.has(mark.word) ? ' frontier' : ''
      if (plain) html += `<b>${escapeHtml(mark.surface)}</b>`
      else if (this.spotForWord(mark.word)) html += `<span class="lk${frontier}" data-word="${mark.word}">${escapeHtml(mark.surface)}</span>`
      else html += `<span class="gl${frontier}" data-word="${mark.word}">${escapeHtml(mark.surface)}</span>`
      cursor = at + mark.surface.length
    }
    return html + escapeHtml(text.slice(cursor))
  }
  private onTextTap(e: Event) {
    const target = e.target as HTMLElement
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act
    if (act === 'next') { this.next(); this.startTourSoon(); return }
    if (act === 'start') { this.startTour(); return }
    const word = target.closest<HTMLElement>('[data-word]')
    if (!word) return
    const value = word.dataset.word!
    const spot = this.spotForWord(value)
    if (spot && word.classList.contains('lk')) {
      this.stopTour(true)
      this.frame([spot.id], 450)
      setTimeout(() => this.flash(spot), 450)
      this.markFound(spot)
      this.toast(`${spot.word} · ${this.gloss(spot.word)}`)
      this.emitWord(spot.word, 'spot')
      void this.say(spot.word, 'word')
    } else {
      this.toast(`${word.textContent} · ${this.gloss(value)}${this.frontierSet.has(value) ? ` · ${this.ui.frontier}` : ''}`)
      this.emitWord(value, 'text')
      void this.say(word.textContent || value, 'word')
    }
  }

  // ── Tour ────────────────────────────────────────────────────────────────────
  private updateTourButton() {
    const button = this.$('[data-act=tour]')
    if (!button) return
    button.textContent = this.touring ? this.ui.stop : this.ui.tour
    button.classList.toggle('on', this.touring)
  }
  private setSubtitle(html: string | null) {
    const sub = this.$('.sub')
    if (!sub) return
    if (html === null) { sub.classList.remove('show'); this.insetBottom = 0 } else {
      sub.innerHTML = html
      sub.classList.add('show')
      this.insetBottom = sub.getBoundingClientRect().height
    }
    this.cam = this.clamp(this.cam)
    this.apply()
  }
  private renderSubtitle() {
    const steps = this.page ? flatten(this.page.steps) : []
    const step = steps[this.tourStep]
    if (!step) return
    if (step.kind === 'interaction') { this.renderFind(); return }
    const who = step.speaker ? this.world?.characters[step.speaker.split(':')[1]]?.name : null
    this.setSubtitle(`<div class="meta">${this.tourStep + 1} / ${steps.length}</div><div>${who ? `<span class="who">${escapeHtml(who)}</span>` : ''}${this.lineHtml(step)}</div>${this.translations && step.translation ? `<div class="tr">${escapeHtml(step.translation)}</div>` : ''}`)
  }
  startTour() {
    if (!this.page) return
    this.$('.card').classList.remove('open')
    this.touring = true
    this.updateTourButton()
    this.play(0)
  }
  private startTourSoon() { setTimeout(() => this.setSubtitle(`<div class="meta">${this.index + 1} / ${this.lesson!.pages.length}</div><button class="pill big on" data-act="start">${this.ui.start}</button>`), 50) }
  stopTour(keepSubtitle = false) {
    this.touring = false
    this.finding = null
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel() } catch { /* ignore */ }
    this.updateTourButton()
    if (!keepSubtitle) { this.tourStep = -1; this.setSubtitle(null) }
  }
  private play(i: number) {
    const steps = flatten(this.page!.steps)
    if (!this.touring) return
    if (i >= steps.length) { this.endOfPage(); return }
    this.tourStep = i
    const step = steps[i]
    if (step.kind === 'interaction') { this.beginFind(step); return }
    this.renderSubtitle()
    const look = step.look?.length ? step.look : step.words.map((word) => this.spotForWord(word)?.id).filter((id): id is string => Boolean(id))
    if (look.length) {
      this.frame(look)
      setTimeout(() => look.forEach((id) => { const spot = this.spot(id); if (spot) this.flash(spot, 1400) }), 700)
    }
    void this.say(step.text, 'line').then(() => { if (this.touring && this.tourStep === i) setTimeout(() => this.play(i + 1), 350) })
  }
  private endOfPage() {
    this.touring = false
    this.updateTourButton()
    const last = this.index >= this.lesson!.pages.length - 1
    this.setSubtitle(`<div class="meta">${this.ui.done}</div>${last ? `<div>${this.ui.end}</div>` : `<button class="pill big on" data-act="next">${this.ui.next}</button>`}`)
    if (last) this.dispatchEvent(new CustomEvent('lml-end'))
  }

  // ── Find ────────────────────────────────────────────────────────────────────
  private beginFind(step: InteractionStep) {
    this.finding = { step, targets: (step.props.targets || '').split(/[\s,]+/).filter(Boolean), found: new Set() }
    this.home()
    this.renderFind()
  }
  private renderFind() {
    const f = this.finding
    if (!f) return
    this.setSubtitle(`<div class="meta">${this.ui.found} ${f.found.size} / ${f.targets.length}</div><div>${escapeHtml(f.step.props.prompt || '')}</div>`)
  }
  private findTap(spot: Spot | null) {
    const f = this.finding!
    if (!spot || !f.targets.includes(spot.id)) { this.toast(this.ui.notThis); return }
    if (f.found.has(spot.id)) return
    f.found.add(spot.id)
    this.flash(spot, 1200)
    this.markFound(spot)
    this.toast(`${this.ui.foundIt}: ${spot.word} · ${this.gloss(spot.word)}`)
    this.emitWord(spot.word, 'spot')
    void this.say(spot.word, 'word')
    this.renderFind()
    if (f.found.size === f.targets.length) {
      for (const action of f.step.handlers.correct || []) {
        if (action.kind === 'evidence') this.dispatchEvent(new CustomEvent('lml-evidence', { detail: { facet: action.facet, target: action.target, interaction: f.step.id } }))
      }
      this.finding = null
      const next = this.tourStep + 1
      this.touring = true
      this.updateTourButton()
      setTimeout(() => this.play(next), 900)
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('lml-pages')) customElements.define('lml-pages', LmlPagesElement)
