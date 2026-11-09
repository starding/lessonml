// LessonML screenplay syntax → IR (SPEC.md §5).
//
// The surface is a screenplay because that is the form language models have
// read most of: speaker lines, narration, stage directions. Every construct
// is one line; blocks are indented by two spaces.

import type { Action, BranchStep, Diagnostic, InteractionOption, InteractionStep, Lesson, LineStep, Page, Scene, Spot, Step } from './ir.js'

interface SourceLine { no: number; indent: number; text: string }

// {word} or {surface|lemma}; {=expression} is live text, not a target word.
const WORD_MARK = /\{(?!=)([^}|]+)(?:\|([^}]+))?\}/g

// "{disclosure}" → text "disclosure", word "disclosure"; "{verified|verify}" →
// text "verified", word "verify".
export const extractWords = (raw: string) => {
  const words: string[] = []
  const marks: { surface: string; word: string }[] = []
  const text = raw.replace(WORD_MARK, (_, surface: string, lemma?: string) => {
    const word = (lemma || surface).trim().toLowerCase()
    words.push(word)
    marks.push({ surface, word })
    return surface
  })
  return { text, words, marks }
}

const unquote = (value: string) => {
  const trimmed = value.trim()
  return /^".*"$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed
}

const SPEAKER_LINE = /^([A-Z][A-Z0-9_]*)\s*(?:\(([a-z-]+)\))?\s*:\s*(.+)$/
const SCENE_LINE = /^#\s*scene\s+([a-z0-9-]+)\s+@([a-z0-9-]+:[a-z0-9/-]+)\s*$/
const PAGE_LINE = /^#\s*page\s+([a-z0-9-]+)(?:\s+@([a-z0-9-]+:[a-z0-9/-]+))?\s*$/
const SPOT_LINE = /^spot\s+([a-z0-9-]+)(?:\s+"([^"]+)")?\s*:\s*(.+)$/
const IMAGE_LINE = /^image\s*:\s*(\S+)\s+(\d+)x(\d+)\s*$/
const CONDITION = /^if\s+(.+?)\s*:\s*$/
const SET_ACTION = /^set\s+([A-Za-z_][\w.]*)\s*(\+=|-=|=)\s*(.+)$/

export interface ParseResult {
  lesson: Lesson
  diagnostics: Diagnostic[]
}

export function parseScreenplay(source: string): ParseResult {
  const diagnostics: Diagnostic[] = []
  const lesson: Lesson = { id: '', world: '', language: 'en', state: {}, formulas: {}, glossary: {}, targets: [], scenes: [], pages: [] }
  const rawLines = source.replace(/\r\n/g, '\n').split('\n')
  let cursor = 0

  // ── Front matter ──────────────────────────────────────────────────────────
  if (rawLines[0]?.trim() === '---') {
    cursor = 1
    let section: 'state' | 'glossary' | 'formulas' | null = null
    for (; cursor < rawLines.length && rawLines[cursor].trim() !== '---'; cursor++) {
      const raw = rawLines[cursor]
      if (!raw.trim() || raw.trim().startsWith('//')) continue
      const nested = /^\s+/.test(raw)
      // Keys are bare ("pitch") or quoted when they hold spaces ("straw hat").
      const match = raw.trim().match(/^([a-z_.0-9:'/-]+)\s*:\s*(.*)$/) || raw.trim().match(/^"([^"]+)"\s*:\s*(.*)$/)
      if (!match) {
        diagnostics.push({ line: cursor + 1, code: 'front-matter', message: `cannot read "${raw.trim()}". Front matter lines are "key: value".` })
        continue
      }
      const [, key, value] = match
      if (nested && section === 'glossary') {
        const [gloss, definition] = unquote(value).split('|').map((part) => part.trim())
        lesson.glossary[key] = definition ? { gloss, definition } : { gloss }
        continue
      }
      if (nested && section === 'formulas') {
        lesson.formulas[key] = value.trim()
        continue
      }
      if (nested && section === 'state') {
        const number = Number(value)
        if (Number.isNaN(number)) diagnostics.push({ line: cursor + 1, code: 'state-value', message: `state ${key} must start as a number, got "${value}".` })
        else lesson.state[key] = number
        continue
      }
      section = key === 'state' || key === 'glossary' || key === 'formulas' ? key : null
      if (key === 'lesson') lesson.id = value.trim()
      else if (key === 'world') lesson.world = value.trim()
      else if (key === 'language') lesson.language = value.trim()
      else if (key === 'learner_language') lesson.learnerLanguage = value.trim()
      else if (key === 'targets') lesson.targets = value.split(/[\s,]+/).map((word) => word.trim().toLowerCase()).filter(Boolean)
      else if (!section) diagnostics.push({ line: cursor + 1, code: 'front-matter', message: `unknown key "${key}".`, suggestions: ['lesson', 'world', 'language', 'learner_language', 'targets', 'state', 'formulas', 'glossary'] })
    }
    cursor += 1
  }
  if (!lesson.id) diagnostics.push({ line: 1, code: 'missing-lesson-id', message: 'front matter needs "lesson: namespace:name".' })

  const lines: SourceLine[] = []
  for (let index = cursor; index < rawLines.length; index++) {
    const raw = rawLines[index]
    if (!raw.trim() || raw.trim().startsWith('//')) continue
    const indent = raw.match(/^ */)![0].length
    if (indent % 2 !== 0) diagnostics.push({ line: index + 1, code: 'indent', message: 'indent with multiples of two spaces.' })
    lines.push({ no: index + 1, indent, text: raw.trim() })
  }

  const parseLine = (line: SourceLine): LineStep | null => {
    if (line.text.startsWith('>')) {
      const { text, words, marks } = extractWords(line.text.slice(1).trim())
      return { kind: 'line', line: line.no, speaker: null, text, words, marks }
    }
    const match = line.text.match(SPEAKER_LINE)
    if (!match) return null
    const { text, words, marks } = extractWords(unquote(match[3]))
    return { kind: 'line', line: line.no, speaker: match[1].toLowerCase(), expression: match[2], text, words, marks }
  }

  const parseAction = (line: SourceLine): Action | null => {
    const evidence = line.text.match(/^evidence\s+([a-z-]+)\s+([A-Za-z0-9:'/-]+)$/)
    if (evidence) return { kind: 'evidence', line: line.no, facet: evidence[1], target: evidence[2] }
    const set = line.text.match(SET_ACTION)
    if (set) return { kind: 'set', line: line.no, variable: set[1], op: set[2] as Action['op'], expr: set[3].trim() }
    const say = parseLine(line)
    if (say) return { kind: 'say', line: line.no, say }
    return null
  }

  // Children of the line at `index`: following lines indented deeper.
  const childrenOf = (index: number) => {
    const parent = lines[index]
    let end = index + 1
    while (end < lines.length && lines[end].indent > parent.indent) end++
    return { children: lines.slice(index + 1, end), next: end }
  }

  const parseInteraction = (index: number, component: string, id: string): { step: InteractionStep; next: number } => {
    const head = lines[index]
    const step: InteractionStep = { kind: 'interaction', line: head.no, component, id, props: {}, words: [], options: [], handlers: {} }
    const { children, next } = childrenOf(index)
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (child.indent !== head.indent + 2) continue
      const option = child.text.match(/^([-*])\s+(.+)$/)
      if (option) {
        const { text, words } = extractWords(unquote(option[2]))
        step.words.push(...words)
        const parsed: InteractionOption = { text, correct: option[1] === '*', line: child.no }
        const hint = children[i + 1]?.indent > child.indent ? children[i + 1].text.match(/^hint\s*:\s*(.+)$/) : null
        if (hint) {
          parsed.hint = unquote(hint[1])
          i++
        }
        step.options.push(parsed)
        continue
      }
      const handler = child.text.match(/^on\s+([a-z-]+)\s*:\s*(.*)$/)
      if (handler) {
        const actions: Action[] = []
        const inline = handler[2].trim()
        const inlineParts = inline ? inline.split(';').map((part) => ({ no: child.no, indent: child.indent + 2, text: part.trim() })) : []
        const nested: SourceLine[] = []
        while (children[i + 1] && children[i + 1].indent > child.indent) nested.push(children[++i])
        for (const actionLine of [...inlineParts, ...nested]) {
          const action = parseAction(actionLine)
          if (action) actions.push(action)
          else diagnostics.push({ line: actionLine.no, code: 'action', message: `cannot read action "${actionLine.text}".`, suggestions: ['evidence <facet> <target>', 'set <variable> += <expression>', 'NAME (expression): "line"'] })
        }
        step.handlers[handler[1]] = [...(step.handlers[handler[1]] || []), ...actions]
        continue
      }
      const prop = child.text.match(/^([a-z_]+)\s*:\s*(.+)$/)
      if (prop) {
        const { text, words } = extractWords(unquote(prop[2]))
        step.props[prop[1]] = text
        step.words.push(...words)
        continue
      }
      diagnostics.push({ line: child.no, code: 'interaction-body', message: `cannot read "${child.text}" inside ? ${component}.`, suggestions: ['key: value', '- wrong option', '* correct option', 'on correct: ...'] })
    }
    step.words = Array.from(new Set(step.words))
    return { step, next }
  }

  const parseBlock = (start: number, end: number, indent: number): Step[] => {
    const steps: Step[] = []
    let index = start
    while (index < end) {
      const line = lines[index]
      if (line.indent !== indent) {
        diagnostics.push({ line: line.no, code: 'indent', message: `unexpected indent (${line.indent} spaces, expected ${indent}).` })
        index++
        continue
      }
      if (line.text.startsWith('!')) {
        const [verb, ...args] = line.text.slice(1).trim().split(/\s+/)
        steps.push({ kind: 'stage', line: line.no, verb, args })
        index++
        continue
      }
      if (line.text.startsWith('?')) {
        const [component, id] = line.text.slice(1).trim().split(/\s+/)
        if (!component || !id) {
          diagnostics.push({ line: line.no, code: 'interaction-head', message: 'write "? <component> <id>", e.g. "? lessonml:pick-evidence case-1".' })
          index = childrenOf(index).next
          continue
        }
        const { step, next } = parseInteraction(index, component, id)
        steps.push(step)
        index = next
        continue
      }
      const condition = line.text.match(CONDITION)
      if (condition) {
        const { next } = childrenOf(index)
        const branch: BranchStep = {
          kind: 'branch',
          line: line.no,
          condition: condition[1],
          steps: parseBlock(index + 1, next, indent + 2)
        }
        steps.push(branch)
        index = next
        continue
      }
      const spoken = parseLine(line)
      if (spoken) {
        const { children, next } = childrenOf(index)
        const look = children.find((child) => /^look\s*:/.test(child.text))
        if (look) spoken.look = look.text.replace(/^look\s*:/, '').trim().split(/[\s,]+/).filter(Boolean)
        const translation = children.find((child) => !/^look\s*:/.test(child.text) && /^[a-z]{2}(-[A-Za-z]+)?\s*:/.test(child.text))
        if (translation) spoken.translation = unquote(translation.text.replace(/^[a-z]{2}(-[A-Za-z]+)?\s*:/, ''))
        steps.push(spoken)
        index = next
        continue
      }
      diagnostics.push({
        line: line.no,
        code: 'unknown-line',
        message: `cannot read "${line.text}".`,
        suggestions: ['NAME (expression): "spoken line"', '> narration', '! verb args', '? component id', 'if <expression>:']
      })
      index++
    }
    return steps
  }

  // ── Pages ─────────────────────────────────────────────────────────────────
  // Header lines (image:, art:, spot ...) come first; the rest are steps.
  const parsePage = (start: number, end: number, id: string, place: string | null): Page => {
    const head = lines[start]
    const page: Page = { id, place, line: head.no, image: { src: '', width: 0, height: 0 }, spots: [], steps: [] }
    let index = start + 1
    for (; index < end; index++) {
      const line = lines[index]
      if (line.indent !== 0) break
      const image = line.text.match(IMAGE_LINE)
      if (image) { page.image = { src: image[1], width: Number(image[2]), height: Number(image[3]) }; continue }
      if (/^image\s*:/.test(line.text)) {
        diagnostics.push({ line: line.no, code: 'image-line', message: 'write the image as "image: <path> <width>x<height>", e.g. "image: kitchen.jpg 1024x1536".' })
        continue
      }
      const art = line.text.match(/^art\s*:\s*(.+)$/)
      if (art) { page.art = unquote(art[1]); continue }
      const spot = line.text.match(SPOT_LINE)
      if (spot) {
        const parsed = parseShapes(spot[3])
        if (typeof parsed === 'string') diagnostics.push({ line: line.no, code: 'spot-shape', message: `spot ${spot[1]}: ${parsed}`, suggestions: ['spot kettle: 90 620 196 742', 'spot cup: 10 10 40 40 | 60 10 90 40', 'spot hose: poly 10 10 80 20 70 60'] })
        page.spots.push({ id: spot[1], word: (spot[2] || spot[1]).toLowerCase(), shapes: typeof parsed === 'string' ? [] : parsed, line: line.no } satisfies Spot)
        continue
      }
      if (/^spot\b/.test(line.text)) {
        diagnostics.push({ line: line.no, code: 'spot-line', message: 'write a spot as "spot <id>: x1 y1 x2 y2" or "spot <id> \"two words\": ...".' })
        continue
      }
      break
    }
    page.steps = parseBlock(index, end, 0)
    return page
  }

  // "x1 y1 x2 y2 | poly x y x y x y ..." → polygons in image pixels.
  const parseShapes = (raw: string): [number, number][][] | string => {
    const shapes: [number, number][][] = []
    for (const part of raw.split('|').map((piece) => piece.trim()).filter(Boolean)) {
      const poly = part.startsWith('poly')
      const numbers = part.replace(/^poly/, '').trim().split(/[\s,]+/).map(Number)
      if (numbers.some((n) => !Number.isFinite(n))) return `"${part}" has something that is not a number.`
      if (!poly) {
        if (numbers.length !== 4) return `a rectangle is four numbers "x1 y1 x2 y2", got ${numbers.length}.`
        const [x1, y1, x2, y2] = numbers
        if (x2 <= x1 || y2 <= y1) return `rectangle "${part}" needs x2 > x1 and y2 > y1.`
        shapes.push([[x1, y1], [x2, y1], [x2, y2], [x1, y2]])
      } else {
        if (numbers.length < 6 || numbers.length % 2) return `a polygon is "poly" and at least three x y pairs, got ${numbers.length} numbers.`
        const points: [number, number][] = []
        for (let i = 0; i < numbers.length; i += 2) points.push([numbers[i], numbers[i + 1]])
        shapes.push(points)
      }
    }
    return shapes.length ? shapes : 'no shape given.'
  }

  // ── Scenes ────────────────────────────────────────────────────────────────
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const scene = line.indent === 0 ? line.text.match(SCENE_LINE) : null
    const pageHead = line.indent === 0 && !scene ? line.text.match(PAGE_LINE) : null
    let end = index + 1
    while (end < lines.length && !(lines[end].indent === 0 && lines[end].text.startsWith('#'))) end++
    if (pageHead) {
      lesson.pages.push(parsePage(index, end, pageHead[1], pageHead[2] || null))
      index = end
      continue
    }
    if (!scene) {
      diagnostics.push({ line: line.no, code: 'outside-scene', message: 'every step belongs to a scene or a page. Start one with "# scene <id> @<place-id>" or "# page <id>".' })
      index++
      continue
    }
    const parsed: Scene = { id: scene[1], place: scene[2], line: line.no, steps: parseBlock(index + 1, end, 0) }
    lesson.scenes.push(parsed)
    index = end
  }
  return { lesson, diagnostics }
}
