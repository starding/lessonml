// compile = parse + resolve + check against a world (SPEC.md §6).
//
// The gate is strict so a runtime can be forgiving. Every diagnostic says
// where, what, and what would be valid, so the model that wrote the text can
// repair it without a human.

import { CORE_COMPONENTS, EVIDENCE_FACETS, TARGET_ID, closest, toTargetId, type World } from './catalog.js'
import type { Diagnostic, Lesson, LineStep, Step } from './ir.js'
import { CONSTANTS, ExprError, FUNCTIONS, INTERPOLATION, callsIn, namesIn, parseExpr } from './expr.js'
import { parseControls } from './controls.js'
import { parseScreenplay } from './screenplay.js'

export interface CompileResult {
  lesson: Lesson
  diagnostics: Diagnostic[]
  ok: boolean
}

export function compile(source: string, world: World): CompileResult {
  const { lesson, diagnostics } = parseScreenplay(source)
  const ns = world.namespace
  // Bare terms belong to the lesson's language: "pitch" → "en:pitch".
  lesson.glossary = Object.fromEntries(Object.entries(lesson.glossary).map(([key, entry]) => [toTargetId(key, lesson.language), entry]))
  const characterByName = new Map(Object.entries(world.characters).map(([key, character]) => [character.name.toLowerCase(), key]))
  const report = (line: number, code: string, message: string, suggestions?: string[]) => diagnostics.push({ line, code, message, suggestions })
  const declared = new Set(Object.keys(lesson.state))
  const formulaNames = Object.keys(lesson.formulas)
  const known = () => [...declared, ...formulaNames]

  // Every expression: parses, uses known names and functions.
  const checkExpr = (source: string, line: number, where: string) => {
    let tree
    try {
      tree = parseExpr(source)
    } catch (error) {
      const at = error instanceof ExprError ? ` at character ${error.position + 1}` : ''
      report(line, 'bad-expression', `${where}: cannot read "${source}"${at}: ${(error as Error).message}.`)
      return null
    }
    for (const name of namesIn(tree)) {
      if (!(name in CONSTANTS) && !declared.has(name) && !formulaNames.includes(name)) {
        report(line, 'unknown-name', `${where}: "${name}" is not a state variable or formula. Declare it under "state:" or "formulas:".`, closest(name, known()))
      }
    }
    for (const call of callsIn(tree)) {
      const fn = FUNCTIONS[call.fn]
      if (!fn) report(line, 'unknown-function', `${where}: no function "${call.fn}". Functions: ${Object.keys(FUNCTIONS).join(', ')}.`, closest(call.fn, Object.keys(FUNCTIONS)))
      else if (call.count < fn.arity[0] || call.count > fn.arity[1]) report(line, 'function-arity', `${where}: ${call.fn} takes ${fn.arity[0] === fn.arity[1] ? fn.arity[0] : `${fn.arity[0]}–${fn.arity[1]}`} argument(s), got ${call.count}.`)
    }
    return tree
  }
  const checkText = (text: string | undefined, line: number, where: string) => {
    for (const match of (text || '').matchAll(INTERPOLATION)) checkExpr(match[1], line, `${where} {=${match[1]}}`)
  }

  // Formulas: valid, not shadowing state, no cycles.
  const formulaDeps = new Map<string, Set<string>>()
  for (const [name, source] of Object.entries(lesson.formulas)) {
    if (declared.has(name)) report(1, 'formula-shadows-state', `formula "${name}" has the same name as a state variable; rename one.`)
    const tree = checkExpr(source, 1, `formula ${name}`)
    if (tree) formulaDeps.set(name, new Set([...namesIn(tree)].filter((dep) => formulaNames.includes(dep))))
  }
  const visiting = new Set<string>(), done = new Set<string>()
  const visit = (name: string, path: string[]): void => {
    if (done.has(name)) return
    if (visiting.has(name)) { report(1, 'formula-cycle', `formulas depend on each other in a loop: ${[...path, name].join(' → ')}.`); return }
    visiting.add(name)
    for (const dep of formulaDeps.get(name) || []) visit(dep, [...path, name])
    visiting.delete(name)
    done.add(name)
  }
  formulaNames.forEach((name) => visit(name, []))
  const interactionIds = new Set<string>()

  const checkLine = (step: LineStep) => {
    checkText(step.text, step.line, 'line')
    if (step.speaker === null) return
    const key = characterByName.get(step.speaker)
    if (!key) {
      report(step.line, 'unknown-speaker', `${step.speaker.toUpperCase()} is not a character in ${ns}.`, closest(step.speaker, [...characterByName.keys()]).map((name) => name.toUpperCase()))
      return
    }
    step.speaker = `${ns}:${key}`
    const expressions = world.characters[key].expressions
    if (step.expression && !expressions.includes(step.expression)) {
      report(step.line, 'unknown-expression', `${world.characters[key].name} has no expression "${step.expression}". Available: ${expressions.join(', ')}.`, closest(step.expression, expressions))
    }
  }

  const checkSteps = (steps: Step[], placeKey: string) => {
    const place = world.places[placeKey]
    for (const step of steps) {
      if (step.kind === 'line') checkLine(step)
      else if (step.kind === 'stage') {
        checkText(step.args.join(' '), step.line, `! ${step.verb}`)
        if (!place) continue
        const allowed = place.stage[step.verb]
        if (!allowed) {
          report(step.line, 'unknown-stage-verb', `@${ns}:${placeKey} has no stage verb "${step.verb}". Available: ${Object.keys(place.stage).join(', ')}.`, closest(step.verb, Object.keys(place.stage)))
          continue
        }
        if (allowed.includes('*')) continue
        for (const arg of step.args) {
          if (!allowed.includes(arg)) report(step.line, 'unknown-stage-arg', `"! ${step.verb} ${arg}": ${arg} is not available here. Use one of: ${allowed.join(', ')}.`, closest(arg, allowed))
        }
        if (step.args.length === 0) report(step.line, 'missing-stage-arg', `"! ${step.verb}" needs one of: ${allowed.join(', ')}.`)
      } else if (step.kind === 'interaction') {
        const component = CORE_COMPONENTS[step.component]
        if (!component) {
          report(step.line, 'unknown-component', `no component "${step.component}".`, closest(step.component, Object.keys(CORE_COMPONENTS)))
          continue
        }
        if (interactionIds.has(step.id)) report(step.line, 'duplicate-id', `interaction id "${step.id}" is already used in this lesson; ids must be unique.`)
        interactionIds.add(step.id)
        for (const prop of component.props.required) {
          if (!step.props[prop]) report(step.line, 'missing-prop', `${step.component} needs "${prop}: ...".`)
        }
        for (const [prop, value] of Object.entries(step.props)) checkText(value, step.line, `${step.id} ${prop}`)
        if (step.component === 'lessonml:numeric' && step.props.answer) {
          checkExpr(step.props.answer, step.line, `${step.id} answer`)
          if (step.props.tolerance && !/^\d+(\.\d+)?%?$/.test(step.props.tolerance.trim())) report(step.line, 'bad-tolerance', `${step.id}: tolerance is a number ("0.5") or a percentage ("2%").`)
        }
        if (step.component === 'lessonml:explore') {
          const { controls, errors } = parseControls(step.props.controls || '')
          errors.forEach((message) => report(step.line, 'bad-controls', `${step.id}: ${message}.`))
          for (const control of controls) {
            if (!declared.has(control.name)) report(step.line, 'undeclared-state', `${step.id}: control "${control.name}" must be a state variable (formulas cannot be moved).`, closest(control.name, [...declared]))
          }
          if (step.props.goal) checkExpr(step.props.goal, step.line, `${step.id} goal`)
        }
        const known = [...component.props.required, ...component.props.optional]
        for (const prop of Object.keys(step.props)) {
          if (!known.includes(prop)) report(step.line, 'unknown-prop', `${step.component} has no prop "${prop}". Props: ${known.join(', ')}.`, closest(prop, known))
        }
        const rule = component.options
        if (!rule && step.options.length > 0) report(step.line, 'unexpected-options', `${step.component} takes no options.`)
        if (rule) {
          if (step.options.length < rule.min || step.options.length > rule.max) report(step.line, 'option-count', `${step.component} takes ${rule.min}–${rule.max} options, got ${step.options.length}.`)
          const correct = step.options.filter((option) => option.correct).length
          if (rule.correct === 'one' && correct !== 1) report(step.line, 'correct-count', `${step.component} needs exactly one correct option marked "*", got ${correct}.`)
          if (rule.correct === 'none' && correct > 0) report(step.line, 'correct-count', `${step.component} options are distractors; mark none with "*" (the answer is the "answer" prop).`)
          for (const option of step.options) {
            if (!option.correct && !option.hint) report(option.line, 'missing-hint', `wrong option "${option.text}" needs an indented "hint: ..." so the learner learns why.`)
          }
        }
        for (const [event, actions] of Object.entries(step.handlers)) {
          if (!component.events.includes(event)) report(step.line, 'unknown-event', `${step.component} emits no "${event}". Events: ${component.events.join(', ')}.`, closest(event, component.events))
          for (const action of actions) {
            if (action.kind === 'evidence') {
              action.target = toTargetId(action.target || '', lesson.language)
              if (!TARGET_ID.test(action.target)) report(action.line, 'bad-target', `evidence target "${action.target}" must be a word or a namespaced id like "math:fraction-equivalence".`)
              if (!EVIDENCE_FACETS.includes(action.facet as never)) report(action.line, 'unknown-facet', `evidence facet "${action.facet}" is not in the vocabulary: ${EVIDENCE_FACETS.join(', ')}.`, closest(action.facet || '', [...EVIDENCE_FACETS]))
              else if (!component.facets.includes(action.facet as never)) report(action.line, 'facet-not-produced', `${step.component} cannot produce "${action.facet}" evidence. It produces: ${component.facets.join(', ')}.`)
            } else if (action.kind === 'set') {
              if (!declared.has(action.variable || '')) report(action.line, 'undeclared-state', `state "${action.variable}" is not declared. Add it under "state:" in the front matter.`, closest(action.variable || '', [...declared]))
              checkExpr(action.expr || '', action.line, `set ${action.variable}`)
            } else if (action.say) checkLine(action.say)
          }
        }
      } else if (step.kind === 'branch') {
        checkExpr(step.condition, step.line, 'if')
        checkSteps(step.steps, placeKey)
      }
    }
  }

  for (const scene of lesson.scenes) {
    const [namespace, placeKey] = scene.place.split(':')
    if (namespace !== ns || !world.places[placeKey]) {
      report(scene.line, 'unknown-place', `no place @${scene.place} in ${ns}.`, closest(placeKey || '', Object.keys(world.places)).map((key) => `@${ns}:${key}`))
    }
    checkSteps(scene.steps, placeKey)
  }
  if (lesson.scenes.length === 0) report(1, 'empty', 'a lesson needs at least one "# scene <id> @<place-id>".')

  diagnostics.sort((a, b) => a.line - b.line)
  return { lesson, diagnostics, ok: diagnostics.length === 0 }
}

// Diagnostics as the text a model receives back.
export const formatDiagnostics = (diagnostics: Diagnostic[]) => diagnostics
  .map((d) => `line ${d.line} [${d.code}]: ${d.message}${d.suggestions?.length ? ` Did you mean: ${d.suggestions.join(', ')}?` : ''}`)
  .join('\n')
