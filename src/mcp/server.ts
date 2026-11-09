#!/usr/bin/env node
// LessonML MCP server (SPEC.md §9, v0.3): the authoring loop for models.
//
//   guide → describe_world → write → compile (fix) → simulate → render_preview (look, fix)
//
// Run: node dist/src/mcp/server.js   (stdio). Worlds are read from paths
// relative to LESSONML_ROOT (default: the package root).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { CORE_COMPONENTS, describeWorld, type World } from '../catalog.js'
import { compile, formatDiagnostics } from '../validate.js'
import { STYLE_PACKS } from '../rig/styles.js'
import { simulate } from './simulate.js'
import { renderPreviews, closePreviews } from './preview.js'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const ROOT = path.resolve(process.env.LESSONML_ROOT || PACKAGE_ROOT)

const findWorlds = () => {
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (entry.name === 'world.json') found.push(path.relative(ROOT, full))
    }
  }
  walk(ROOT, 0)
  return found
}

const loadWorld = (worldPath: string): World => {
  const full = path.isAbsolute(worldPath) ? worldPath : path.resolve(ROOT, worldPath)
  if (!fs.existsSync(full)) throw new Error(`no world at ${worldPath}. Worlds here: ${findWorlds().join(', ') || 'none'}`)
  return JSON.parse(fs.readFileSync(full, 'utf8')) as World
}

// The world a lesson declares in its front matter, unless one is passed.
const resolveWorld = (source: string, world?: string, lessonPath?: string) => {
  if (world) return loadWorld(world)
  const declared = source.match(/^world:\s*(.+)$/m)?.[1]?.trim()
  if (!declared) throw new Error('pass "world" (a world.json path) or declare "world:" in the front matter')
  const base = lessonPath ? path.dirname(path.isAbsolute(lessonPath) ? lessonPath : path.resolve(ROOT, lessonPath)) : ROOT
  return loadWorld(path.resolve(base, declared))
}

const readSource = (args: { source?: string; path?: string }) => {
  if (args.source) return args.source
  if (args.path) return fs.readFileSync(path.isAbsolute(args.path) ? args.path : path.resolve(ROOT, args.path), 'utf8')
  throw new Error('pass "source" (screenplay text) or "path" (a .lml file)')
}

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] })
const failure = (error: unknown) => ({ content: [{ type: 'text' as const, text: `error: ${error instanceof Error ? error.message : String(error)}` }], isError: true })

export const GUIDE = `# Writing LessonML

A lesson is a screenplay. You write it; the compiler checks it against a world; the player stages it.
Loop: lessonml_describe_world → write → lessonml_compile until ok → lessonml_simulate → lessonml_render_preview, fix what looks wrong.

## Syntax (one construct per line, blocks indented by two spaces)
---
lesson: <namespace>:<lesson-name>
world: <path to world.json, relative to this file>
language: en
learner_language: zh
state:
  trust.priya: 0          # numbers only
formulas:                 # optional: named expressions, evaluated live
  balance: principal * (1 + rate) ^ years
glossary:                 # optional: this lesson's sense of a term
  pitch: 提案 | a short talk to persuade someone
---
# scene <id> @<namespace>:<place>
! camera <shot>            # stage verbs and their values come from the place (describe_world)
! effect <name>            # applies to the next line only
NAME (expression): "Spoken line with a {target} word or {surface|lemma}."
  zh: 翻译
> Narration.
? lessonml:<component> <unique-id>
  prompt: ...
  - wrong option
    hint: why it is wrong (required, in the learner's language)
  * the one correct option
  on correct: evidence <facet> <target>; set <state> += 1   # target: a word (en:word) or a skill id (math:fraction-equivalence)
  on wrong: NAME (expression): "reaction"
if <expression>:          # e.g. trust.priya > 0 && balance > 2000
  NAME (smile): "only if the learner earned it"

## Illustrated pages (v0.6): a picture to explore instead of a staged scene
targets: kettle steam rely  # front matter: the words this lesson was written to teach; each must be a spot or a {word}
# page <id> @<namespace>:<place>    # the place is optional; it keeps a recurring place the same
image: kitchen.jpg 1024x1536        # path relative to the lesson, and its size in pixels
art: "What the illustrator or image model is asked to draw; name every object you will make a spot."
spot kettle: 90 620 196 742         # x1 y1 x2 y2 in image pixels; the spot teaches the word "kettle"
spot mitt "oven mitt": 712 300 808 450 | 248 455 300 570    # quoted word; several shapes joined with |
spot hose: poly 10 10 80 20 70 60   # a polygon
> The {kettle} is whistling, and we {rely} on it every morning.
  look: kettle                      # spots the camera frames while this line is read
  zh: 水壶在响，我们每天早上都靠它。
? lessonml:find hot-things          # the only component pages run: find spots in the picture
  prompt: Find two things that are hot.
  targets: kettle stove             # spot ids on this page
  on correct: evidence recall kettle
A {word} with a spot of the same word links to the picture; any other {word} is glossed in the text (give it a gloss).
Pages have no stage directions and no set: the picture is the stage.
Live values anywhere in text: {=round(balance)}. Expressions: + - * / % ^, comparisons, && || !, abs sqrt exp ln log10 sin cos tan floor ceil round(x, digits) min max pow clamp, constants pi e g. No strings, no code.

## Components
${Object.entries(CORE_COMPONENTS).map(([id, c]) => `### ${id}\n${c.description}\nprops: ${c.props.required.join(', ')}${c.props.optional.length ? ` (optional: ${c.props.optional.join(', ')})` : ''}; events: ${c.events.join(', ')}; evidence: ${c.facets.join(', ')}\n\`\`\`\n${c.example}\n\`\`\``).join('\n\n')}

## Craft
- Every scene turns on something the learner does. Put an interaction where the story needs a decision or a discovery, not as a quiz after it.
- Mark 3–6 target words per scene with {braces}; keep other words within the learner's level. Lines under ~25 words.
- Characters stay in character: read their descriptions. Use expressions to show reactions; change the camera when attention moves.
- Wrong options are plausible, and each hint teaches the distinction.
- Let actions matter: change state on good answers and pay it off later with an if-branch.
- Evidence facets must be ones the component can produce (see above). Use skill ids as targets for non-language subjects.
- Give every {marked} word a gloss: in the world's glossary, or under "glossary:" in the front matter (term: 释义 | definition).
- For math and science: put the model in "formulas:", show live values with {=…}, ask for a prediction with lessonml:numeric before revealing, and let the learner discover the relationship with lessonml:explore. Make explore goals tight enough that every solution supports what you say next.
- A character only appears when the set shows their slot: check the place description and switch the screen or camera back before they speak.
- Pages: write the "art:" first, naming every object, then a spot for each one you name. Put words you can draw in the picture and words you cannot (rely, nevertheless) in the lines. End a page with a lessonml:find whose answers are the words being taught. Spot coordinates come from the finished picture, never from imagination.
- Style packs (the player's drawing rules, never named in a lesson): ${Object.keys(STYLE_PACKS).join(', ')}.`

export function createServer() {
  const server = new McpServer({ name: 'lessonml', version: '0.6.0' })

  server.registerTool('lessonml_guide', {
    title: 'LessonML authoring guide',
    description: 'Read first. Syntax, components and craft rules for writing a LessonML lesson.',
    inputSchema: {}
  }, async () => text(GUIDE))

  server.registerTool('lessonml_describe_world', {
    title: 'Describe a world',
    description: 'The characters, places, stage verbs and components a lesson may use, with every id spelled as it must be written. Without "world", lists the worlds available.',
    inputSchema: { world: z.string().optional().describe('Path to a world.json, e.g. examples/harbor/world.json') }
  }, async ({ world }) => {
    try {
      if (!world) return text(`Worlds:\n${findWorlds().map((found) => `- ${found}`).join('\n')}`)
      return text(describeWorld(loadWorld(world)))
    } catch (error) { return failure(error) }
  })

  server.registerTool('lessonml_compile', {
    title: 'Compile a lesson',
    description: 'Check a lesson against its world. Returns "ok" or diagnostics that say where, what, and what would be valid. Fix and call again until ok.',
    inputSchema: {
      source: z.string().optional().describe('Screenplay text'),
      path: z.string().optional().describe('Or a .lml file path'),
      world: z.string().optional().describe('world.json path; defaults to the lesson\'s "world:"')
    }
  }, async (args) => {
    try {
      const source = readSource(args)
      const result = compile(source, resolveWorld(source, args.world, args.path))
      if (!result.ok) return text(`${result.diagnostics.length} problem(s):\n${formatDiagnostics(result.diagnostics)}`)
      const steps = result.lesson.scenes.reduce((sum, scene) => sum + scene.steps.length, 0)
      return text(`ok: ${result.lesson.id}, ${result.lesson.scenes.length} scene(s), ${steps} top-level steps`)
    } catch (error) { return failure(error) }
  })

  server.registerTool('lessonml_simulate', {
    title: 'Play a lesson through',
    description: 'Plays the lesson without drawing and returns the transcript: every line and interaction in order, which branches ran, state and evidence. By default each interaction is answered correctly on the first try; pass "answers" to try other paths (e.g. {"case-1": [0, 1]} picks option 0, then 1).',
    inputSchema: {
      source: z.string().optional(),
      path: z.string().optional(),
      world: z.string().optional(),
      answers: z.record(z.string(), z.array(z.union([z.number(), z.string(), z.boolean()]))).optional()
        .describe('Per interaction id: option indexes (pick/choose), typed text (cloze), or true/false (speak), tried in order')
    }
  }, async (args) => {
    try {
      const source = readSource(args)
      const result = compile(source, resolveWorld(source, args.world, args.path))
      if (!result.ok) return text(`does not compile; run lessonml_compile first:\n${formatDiagnostics(result.diagnostics)}`)
      return text(simulate(result.lesson, args.answers || {}, resolveWorld(source, args.world, args.path)))
    } catch (error) { return failure(error) }
  })

  server.registerTool('lessonml_render_preview', {
    title: 'Render a preview',
    description: 'Screenshots of the lesson as the player stages it, at given frame indexes (0 = first line; lessonml_simulate numbers the frames). Look for text hidden behind the dialogue, wrong shots, missing characters, unreadable screens. Needs Google Chrome (or LESSONML_CHROME).',
    inputSchema: {
      source: z.string().optional(),
      path: z.string().optional(),
      world: z.string().optional(),
      frames: z.array(z.number().int().min(0)).max(6).optional().describe('Frame indexes to render; default [0]'),
      style_pack: z.enum(Object.keys(STYLE_PACKS) as [string, ...string[]]).optional(),
      width: z.number().int().min(320).max(1600).optional().describe('Viewport width, default 390 (phone)'),
      height: z.number().int().min(480).max(1200).optional().describe('Viewport height, default 844')
    }
  }, async (args) => {
    try {
      const source = readSource(args)
      const world = resolveWorld(source, args.world, args.path)
      const result = compile(source, world)
      if (!result.ok) return text(`does not compile; run lessonml_compile first:\n${formatDiagnostics(result.diagnostics)}`)
      const shots = await renderPreviews({
        root: PACKAGE_ROOT,
        source,
        world,
        frames: args.frames?.length ? args.frames : [0],
        stylePack: args.style_pack || 'anime-clean',
        width: args.width || 390,
        height: args.height || 844
      })
      return {
        content: shots.flatMap((shot) => [
          { type: 'text' as const, text: `frame ${shot.frame}: ${JSON.stringify(shot.description)}` },
          { type: 'image' as const, data: shot.png, mimeType: 'image/png' }
        ])
      }
    } catch (error) { return failure(error) }
  })

  return server
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const server = createServer()
  await server.connect(new StdioServerTransport())
  const shutdown = async () => { await closePreviews(); process.exit(0) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
