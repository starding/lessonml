// lessonml check <lesson.lml> [world.json]
// Prints the compiled IR summary or the diagnostics, in the form a model reads.
import fs from 'node:fs'
import path from 'node:path'
import { compile, formatDiagnostics, type World } from '../src/index.js'

const [file, worldArg] = process.argv.slice(2)
if (!file) {
  console.error('usage: lessonml check <lesson.lml> [world.json]')
  process.exit(2)
}
const source = fs.readFileSync(file, 'utf8')
const declaredWorld = source.match(/^world:\s*(.+)$/m)?.[1]?.trim()
const worldPath = worldArg || (declaredWorld ? path.resolve(path.dirname(file), declaredWorld) : '')
if (!worldPath) {
  console.error('no world: pass world.json or declare "world:" in the front matter')
  process.exit(2)
}
const world = JSON.parse(fs.readFileSync(worldPath, 'utf8')) as World
const result = compile(source, world)
if (!result.ok) {
  console.log(formatDiagnostics(result.diagnostics))
  process.exit(1)
}
const steps = result.lesson.scenes.reduce((sum, scene) => sum + scene.steps.length, 0)
console.log(`ok: ${result.lesson.id}, ${result.lesson.scenes.length} scene(s), ${steps} top-level steps`)
