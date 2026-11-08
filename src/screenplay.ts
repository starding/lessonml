// LessonML screenplay syntax → IR (SPEC.md §5).
//
// The surface is a screenplay because that is the form language models have
// read most of: speaker lines, narration, stage directions. Every construct
// is one line; blocks are indented by two spaces.

import type { Action, BranchStep, Diagnostic, InteractionOption, InteractionStep, Lesson, LineStep, Scene, Step } from './ir.js'

interface SourceLine { no: number; indent: number; text: string }

const WORD_MARK = /\{([^}|]+)(?:\|([^}]+))?\}/g

// "{disclosure}" → text "disclosure", word "disclosure"; "{verified|verify}" →
// text "verified", word "verify".
export const extractWords = (raw: string) => {
  const words: string[] = []
  const text = raw.replace(WORD_MARK, (_, surface: string, lemma?: string) => {
    words.push((lemma || surface).trim().toLowerCase())
    return surface
  })
  return { text, words }
}

const unquote = (value: string) => {
  const trimmed = value.trim()
  return /^".*"$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed
}

const SPEAKER_LINE = /^([A-Z][A-Z0-9_]*)\s*(?:\(([a-z-]+)\))?\s*:\s*(.+)$/
const SCENE_LINE = /^#\s*scene\s+([a-z0-9-]+)\s+@([a-z0-9-]+:[a-z0-9/-]+)\s*$/
const CONDITION = /^if\s+([a-z0-9_.]+)\s*(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)\s*:\s*$/
const SET_ACTION = /^set\s+([a-z0-9_.]+)\s*(\+=|-=|=)\s*(-?\d+(?:\.\d+)?)$/

export interface ParseResult {
  lesson: Lesson
  diagnostics: Diagnostic[]
}

export function parseScreenplay(source: string): ParseResult {
  const diagnostics: Diagnostic[] = []
  const lesson: Lesson = { id: '', world: '', language: 'en', state: {}, scenes: [] }
  const rawLines = source.replace(/\r\n/g, '\n').split('\n')
  let cursor = 0

  // ── Front matter ──────────────────────────────────────────────────────────
  if (rawLines[0]?.trim() === '---') {
    cursor = 1
    let inState = false
    for (; cursor < rawLines.length && rawLines[cursor].trim() !== '---'; cursor++) {
      const raw = rawLines[cursor]
      if (!raw.trim() || raw.trim().startsWith('//')) continue
      const nested = /^\s+/.test(raw)
      const match = raw.trim().match(/^([a-z_.0-9]+)\s*:\s*(.*)$/)
      if (!match) {
        diagnostics.push({ line: cursor + 1, code: 'front-matter', message: `cannot read "${raw.trim()}". Front matter lines are "key: value".` })
        continue
      }
      const [, key, value] = match
      if (nested && inState) {
        const number = Number(value)
        if (Number.isNaN(number)) diagnostics.push({ line: cursor + 1, code: 'state-value', message: `state ${key} must start as a number, got "${value}".` })
        else lesson.state[key] = number
        continue
      }
      inState = key === 'state'
      if (key === 'lesson') lesson.id = value.trim()
      else if (key === 'world') lesson.world = value.trim()
      else if (key === 'language') lesson.language = value.trim()
      else if (key === 'learner_language') lesson.learnerLanguage = value.trim()
      else if (key !== 'state') diagnostics.push({ line: cursor + 1, code: 'front-matter', message: `unknown key "${key}".`, suggestions: ['lesson', 'world', 'language', 'learner_language', 'state'] })
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
      const { text, words } = extractWords(line.text.slice(1).trim())
      return { kind: 'line', line: line.no, speaker: null, text, words }
    }
    const match = line.text.match(SPEAKER_LINE)
    if (!match) return null
    const { text, words } = extractWords(unquote(match[3]))
    return { kind: 'line', line: line.no, speaker: match[1].toLowerCase(), expression: match[2], text, words }
  }

  const parseAction = (line: SourceLine): Action | null => {
    const evidence = line.text.match(/^evidence\s+([a-z-]+)\s+([a-z'-]+)$/)
    if (evidence) return { kind: 'evidence', line: line.no, facet: evidence[1], word: evidence[2] }
    const set = line.text.match(SET_ACTION)
    if (set) return { kind: 'set', line: line.no, variable: set[1], op: set[2] as Action['op'], value: Number(set[3]) }
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
          else diagnostics.push({ line: actionLine.no, code: 'action', message: `cannot read action "${actionLine.text}".`, suggestions: ['evidence <facet> <word>', 'set <variable> += <number>', 'NAME (expression): "line"'] })
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
          condition: { variable: condition[1], op: condition[2] as BranchStep['condition']['op'], value: Number(condition[3]) },
          steps: parseBlock(index + 1, next, indent + 2)
        }
        steps.push(branch)
        index = next
        continue
      }
      const spoken = parseLine(line)
      if (spoken) {
        const { children, next } = childrenOf(index)
        const translation = children.find((child) => /^[a-z]{2}(-[A-Za-z]+)?\s*:/.test(child.text))
        if (translation) spoken.translation = unquote(translation.text.replace(/^[a-z]{2}(-[A-Za-z]+)?\s*:/, ''))
        steps.push(spoken)
        index = next
        continue
      }
      diagnostics.push({
        line: line.no,
        code: 'unknown-line',
        message: `cannot read "${line.text}".`,
        suggestions: ['NAME (expression): "spoken line"', '> narration', '! verb args', '? component id', 'if variable > 0:']
      })
      index++
    }
    return steps
  }

  // ── Scenes ────────────────────────────────────────────────────────────────
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const scene = line.indent === 0 ? line.text.match(SCENE_LINE) : null
    if (!scene) {
      diagnostics.push({ line: line.no, code: 'outside-scene', message: 'every step belongs to a scene. Start one with "# scene <id> @<place-id>".' })
      index++
      continue
    }
    let end = index + 1
    while (end < lines.length && !(lines[end].indent === 0 && lines[end].text.startsWith('#'))) end++
    const parsed: Scene = { id: scene[1], place: scene[2], line: line.no, steps: parseBlock(index + 1, end, 0) }
    lesson.scenes.push(parsed)
    index = end
  }
  return { lesson, diagnostics }
}
