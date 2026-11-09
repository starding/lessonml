// Codex provider for the bridge: draws pictures and places spots with the
// learner's own Codex CLI (and so their own ChatGPT plan), never a server key.

import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export interface LocateObject { id: string; description: string }
export interface LocatedSpot { id: string; box: [number, number, number, number] | null }

let codexBinary = 'codex'
export const setCodexBinary = (binary: string) => { codexBinary = binary }

const run = (args: string[], stdin: string, cwd: string, timeoutMs: number) => new Promise<{ code: number; log: string }>((resolve) => {
  const child = spawn(codexBinary, args, { cwd, env: process.env })
  let log = ''
  const keep = (chunk: Buffer) => { log = (log + chunk.toString()).slice(-20000) }
  child.stdout.on('data', keep)
  child.stderr.on('data', keep)
  const timer = setTimeout(() => { child.kill('SIGTERM'); log += '\n[bridge] timed out' }, timeoutMs)
  child.on('error', (error) => { clearTimeout(timer); resolve({ code: -1, log: `${log}\n${error.message}` }) })
  child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, log }) })
  child.stdin.end(stdin)
})

export const codexAvailable = () => new Promise<string | null>((resolve) => {
  const child = spawn(codexBinary, ['--version'])
  let out = ''
  child.stdout.on('data', (chunk) => { out += chunk })
  child.on('error', () => resolve(null))
  child.on('close', (code) => resolve(code === 0 ? out.trim() : null))
})

const extension = (mime: string) => (mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg')
const decodeDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('images must be data URLs (data:image/...;base64,...)')
  return { mime: match[1], bytes: Buffer.from(match[2], 'base64') }
}
const workdir = () => fs.mkdtemp(path.join(os.tmpdir(), 'lessonml-bridge-'))

// One picture from a prompt, with optional reference pictures for continuity.
export async function generateWithCodex(prompt: string, refs: string[], size: string): Promise<{ dataUrl: string; log: string }> {
  const dir = await workdir()
  try {
    const refPaths: string[] = []
    for (const [index, ref] of refs.entries()) {
      const { mime, bytes } = decodeDataUrl(ref)
      const file = path.join(dir, `ref-${index + 1}.${extension(mime)}`)
      await fs.writeFile(file, bytes)
      refPaths.push(file)
    }
    await fs.writeFile(path.join(dir, 'prompt.txt'), prompt)
    const instruction = [
      refPaths.length ? 'The attached images are references: keep the characters, places and painting style consistent with them.' : '',
      `Use your image generation tool ($imagegen) to create ONE image, ${size} pixels, high quality.`,
      'The prompt is the full contents of prompt.txt in this directory.',
      'Save the result as out.png in this directory. Do nothing else: do not modify any other file and do not update any memory files.'
    ].filter(Boolean).join(' ')
    const args = ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'workspace-write', '-C', dir]
    if (refPaths.length) args.push('-i', ...refPaths)
    const { code, log } = await run(args, instruction, dir, 15 * 60 * 1000)
    const out = path.join(dir, 'out.png')
    const exists = await fs.stat(out).then(() => true, () => false)
    if (!exists) throw new Error(`codex did not produce an image (exit ${code}). ${log.slice(-600)}`)
    const bytes = await fs.readFile(out)
    return { dataUrl: `data:image/png;base64,${bytes.toString('base64')}`, log: log.slice(-2000) }
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

const LOCATE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['spots'],
  properties: {
    spots: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'box'],
        properties: { id: { type: 'string' }, box: { anyOf: [{ type: 'null' }, { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 }] } }
      }
    }
  }
}

// Tight boxes for named objects, in image pixels; null when not visible.
export async function locateWithCodex(image: string, width: number, height: number, objects: LocateObject[]): Promise<{ spots: LocatedSpot[]; log: string }> {
  const dir = await workdir()
  try {
    const { mime, bytes } = decodeDataUrl(image)
    const file = path.join(dir, `page.${extension(mime)}`)
    await fs.writeFile(file, bytes)
    await fs.writeFile(path.join(dir, 'schema.json'), JSON.stringify(LOCATE_SCHEMA))
    const instruction = [
      `The attached image is ${width} pixels wide and ${height} pixels tall. Do not run any commands or tools; just look at the image.`,
      'For each object below, return the tightest bounding box around that object as [x1, y1, x2, y2] in image pixels (origin top-left), or null if it is not visible.',
      'Objects (id: description):',
      ...objects.map((object) => `${object.id}: ${object.description}`)
    ].join('\n')
    const out = path.join(dir, 'out.json')
    const { code, log } = await run(['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-C', dir, '--output-schema', 'schema.json', '-o', out, '-i', file], instruction, dir, 5 * 60 * 1000)
    const text = await fs.readFile(out, 'utf8').catch(() => '')
    if (!text) throw new Error(`codex returned no boxes (exit ${code}). ${log.slice(-600)}`)
    const parsed = JSON.parse(text) as { spots: LocatedSpot[] }
    const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)))
    const spots = parsed.spots.map((spot) => ({
      id: spot.id,
      box: spot.box ? [clamp(spot.box[0], width), clamp(spot.box[1], height), clamp(spot.box[2], width), clamp(spot.box[3], height)] as [number, number, number, number] : null
    }))
    return { spots, log: log.slice(-2000) }
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}
