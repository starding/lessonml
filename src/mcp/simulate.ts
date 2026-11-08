// Play a lesson through without drawing and describe it in words: the cheap
// check a model runs before looking at screenshots.

import type { Lesson, Step } from '../ir.js'
import { toTargetId, type World } from '../catalog.js'
import { getSet, registeredSets } from '../sets/index.js'
import { LessonSession, type Frame } from '../player/session.js'

type Answer = number | string | boolean

// The answer a model would give on a first, correct try.
export const correctAnswer = (frame: Extract<Frame, { kind: 'interaction' }>): Answer => {
  const step = frame.step
  if (step.component === 'lessonml:cloze') return step.props.answer || ''
  if (step.component === 'lessonml:speak' || step.component === 'lessonml:write') return true
  return Math.max(0, step.options.findIndex((option) => option.correct))
}

export const answerFrame = (session: LessonSession, answer: Answer) => {
  const frame = session.frame
  if (frame.kind !== 'interaction') throw new Error('no interaction')
  if (typeof answer === 'boolean') return frame.step.component === 'lessonml:write' ? session.reviewed(answer, answer ? undefined : 'The reviewer asked for a revision.') : session.spoke(answer)
  if (typeof answer === 'string') return session.type(answer)
  return session.choose(answer)
}

const stageLabel = (frame: Frame) => {
  const parts = [`camera ${frame.stage.camera ?? '-'}`, `screen ${frame.stage.screen ?? '-'}`]
  if (frame.stage.effects.length) parts.push(`effects ${frame.stage.effects.join(',')}`)
  return `[${parts.join(' · ')}]`
}

const collectBranches = (steps: Step[], out: Array<{ line: number; label: string; steps: Set<Step> }>) => {
  for (const step of steps) {
    if (step.kind !== 'branch') continue
    const inside = new Set<Step>()
    const gather = (list: Step[]) => list.forEach((child) => { inside.add(child); if (child.kind === 'branch') gather(child.steps) })
    gather(step.steps)
    out.push({ line: step.line, label: `if ${step.condition.variable} ${step.condition.op} ${step.condition.value}`, steps: inside })
    collectBranches(step.steps, out)
  }
}

export function simulate(lesson: Lesson, answers: Record<string, Answer[]>, world?: World): string {
  const session = new LessonSession(lesson)
  const out: string[] = []
  const seen = new Set<Step>()
  const words = new Set<string>()
  let guard = 0
  while (guard++ < 2000) {
    const frame = session.frame
    if (frame.kind === 'end') break
    seen.add(frame.step)
    if (frame.kind === 'line') {
      frame.step.words.forEach((word) => words.add(word))
      const who = frame.step.speaker ? `${frame.step.speaker.split(':')[1].toUpperCase()}${frame.step.expression ? ` (${frame.step.expression})` : ''}: ` : '> '
      out.push(`#${frame.index} ${stageLabel(frame)} ${who}${frame.step.text}${frame.step.words.length ? `   {${frame.step.words.join(', ')}}` : ''}`)
    } else {
      frame.step.words.forEach((word) => words.add(word))
      out.push(`#${frame.index} ${stageLabel(frame)} ? ${frame.step.component} ${frame.step.id}: ${frame.step.props.prompt || frame.step.props.line || ''}`)
      const planned = [...(answers[frame.step.id] || [])]
      let tries = 0
      while (!(session.frame as Extract<Frame, { kind: 'interaction' }>).solved && tries++ < 8) {
        const answer = planned.length ? planned.shift()! : correctAnswer(frame)
        const result = answerFrame(session, answer)
        const current = session.frame as Extract<Frame, { kind: 'interaction' }>
        const label = typeof answer === 'number' ? `option ${answer} "${frame.step.options[answer]?.text ?? '?'}"` : JSON.stringify(answer)
        const said = current.feedback?.line ? ` → ${current.feedback.line.speaker?.split(':')[1].toUpperCase() ?? ''}: "${current.feedback.line.text}"` : ''
        const hint = !result.correct && current.feedback?.hint ? ` hint: ${current.feedback.hint}` : ''
        const evidence = result.evidence.map((event) => `evidence ${event.facet} ${event.target}${event.firstTry ? ' (first try)' : ''}`).join(', ')
        out.push(`     ${result.correct ? '✓' : '✗'} ${label}${hint}${said}${evidence ? `; ${evidence}` : ''}; state ${JSON.stringify(session.state)}`)
      }
    }
    if (!session.next()) break
  }
  const branches: Array<{ line: number; label: string; steps: Set<Step> }> = []
  lesson.scenes.forEach((scene) => collectBranches(scene.steps, branches))
  const interactions = lesson.scenes.flatMap((scene) => scene.steps).filter((step) => step.kind === 'interaction')
  const warnings: string[] = []
  for (const [variable, initial] of Object.entries(lesson.state)) {
    if (session.state[variable] === initial && !interactions.some((step) => step.kind === 'interaction' && Object.values(step.handlers).flat().some((action) => action.variable === variable))) {
      warnings.push(`state ${variable} is declared but nothing changes it`)
    }
  }
  for (const step of interactions) {
    if (step.kind === 'interaction' && !Object.values(step.handlers).flat().some((action) => action.kind === 'evidence')) warnings.push(`${step.id} produces no evidence; add "on correct: evidence <facet> <target>"`)
  }
  if (interactions.length === 0) warnings.push('no interactions: the learner never acts')
  for (const scene of lesson.scenes) {
    const place = world?.places[scene.place.split(':')[1]]
    if (world && !getSet(place?.set)) warnings.push(`@${scene.place} has no playable set ("set": "${place?.set ?? ''}"); the player knows: ${registeredSets().join(', ')}`)
  }
  const glossary = { ...(world?.glossary || {}), ...lesson.glossary }
  const unglossed = [...words].filter((word) => !glossary[toTargetId(word, lesson.language)])
  if (unglossed.length) warnings.push(`no gloss for ${unglossed.join(', ')}: add them under "glossary:" in the front matter (term: 释义 | definition) so the learner sees this lesson's sense`)
  return [
    ...out,
    '',
    `end: ${session.frame.index} frames, final state ${JSON.stringify(session.state)}`,
    `evidence: ${session.evidence.map((event) => `${event.facet} ${event.target}${event.firstTry ? '' : ' (after a miss)'}`).join(', ') || 'none'}`,
    `target words met: ${[...words].join(', ') || 'none'}`,
    ...branches.map((branch) => `branch line ${branch.line} (${branch.label}): ${[...branch.steps].some((step) => seen.has(step)) ? 'taken' : 'skipped'}`),
    ...warnings.map((warning) => `warning: ${warning}`)
  ].join('\n')
}
