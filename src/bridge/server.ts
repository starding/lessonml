// The LessonML bridge: a small server on the learner's own computer that lets
// a web app use the learner's own image models (Codex today, Gemini next) to
// draw pages and place spots. It listens on 127.0.0.1 only, answers only the
// origins it was started for, and every call carries the pairing token.
//
//   POST /images  {prompt, refs?, size?}            → {job}
//   POST /locate  {image, width, height, objects}   → {job}
//   GET  /jobs/:id                                   → {status, result?, error?}
//   GET  /health                                     → {ok, version, providers}
//   GET  /relay  (a page, no token)                  → a small window the app opens
//
// Browsers restrict a public HTTPS page from calling a local HTTP server
// (mixed content; Chrome's Local Network Access asks permission). The relay
// window sidesteps both: it is a local page, so its calls to the bridge are
// same-origin, and the app talks to it with postMessage, which crosses
// origins freely. The relay only answers the allowed origins.

import http from 'node:http'
import crypto from 'node:crypto'
import { codexAvailable, generateWithCodex, locateWithCodex, type LocateObject } from './codex.js'

export interface BridgeOptions {
  port: number
  token: string
  origins: string[]
  version: string
  maxConcurrent?: number
}

interface Job { id: string; kind: 'images' | 'locate'; status: 'queued' | 'running' | 'done' | 'error'; result?: unknown; error?: string; created: number; started?: number; finished?: number }

const MAX_BODY = 30 * 1024 * 1024

export function startBridge(options: BridgeOptions) {
  const jobs = new Map<string, Job>()
  const queue: Array<() => Promise<void>> = []
  let running = 0
  const maxConcurrent = options.maxConcurrent ?? 3

  const pump = () => {
    while (running < maxConcurrent && queue.length) {
      const task = queue.shift()!
      running++
      void task().finally(() => { running--; pump() })
    }
  }
  const enqueue = (kind: Job['kind'], work: () => Promise<unknown>) => {
    const job: Job = { id: crypto.randomUUID(), kind, status: 'queued', created: Date.now() }
    jobs.set(job.id, job)
    queue.push(async () => {
      job.status = 'running'
      job.started = Date.now()
      try {
        job.result = await work()
        job.status = 'done'
      } catch (error) {
        job.status = 'error'
        job.error = (error as Error).message
      }
      job.finished = Date.now()
    })
    pump()
    // Forget finished jobs after an hour.
    for (const [id, old] of jobs) if (old.finished && Date.now() - old.finished > 3600_000) jobs.delete(id)
    return job
  }

  const self = `http://127.0.0.1:${options.port}`
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || ''
    const allowed = options.origins.includes(origin) || origin === self
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      // Chrome's Private Network Access: a public page may call this local server.
      res.setHeader('Access-Control-Allow-Private-Network', 'true')
    }
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.method === 'OPTIONS') { res.writeHead(allowed ? 204 : 403).end(); return }
    if (req.method === 'GET' && (req.url || '').split('?')[0] === '/relay') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(relayPage(options.origins, options.version))
      return
    }
    if (origin && !allowed) { send(403, { error: `origin ${origin} is not allowed; start the bridge with --origin ${origin}` }); return }
    if (req.headers.authorization !== `Bearer ${options.token}`) { send(401, { error: 'missing or wrong pairing token' }); return }

    const url = new URL(req.url || '/', 'http://127.0.0.1')
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        send(200, { ok: true, version: options.version, providers: { codex: await codexAvailable(), gemini: null }, running, queued: queue.length })
        return
      }
      const jobMatch = url.pathname.match(/^\/jobs\/([\w-]+)$/)
      if (req.method === 'GET' && jobMatch) {
        const job = jobs.get(jobMatch[1])
        if (!job) { send(404, { error: 'no such job' }); return }
        send(200, job)
        return
      }
      if (req.method !== 'POST') { send(404, { error: 'not found' }); return }
      const body = await readJson(req)
      if (url.pathname === '/images') {
        const prompt = String(body.prompt || '').trim()
        if (!prompt) { send(400, { error: 'prompt is required' }); return }
        const refs = Array.isArray(body.refs) ? body.refs.map(String).slice(0, 4) : []
        const size = /^\d+x\d+$/.test(String(body.size)) ? String(body.size) : '1024x1536'
        const job = enqueue('images', () => generateWithCodex(prompt, refs, size).then(({ dataUrl }) => ({ image: dataUrl })))
        send(202, { job: job.id })
        return
      }
      if (url.pathname === '/locate') {
        const image = String(body.image || '')
        const width = Number(body.width), height = Number(body.height)
        const objects = (Array.isArray(body.objects) ? body.objects : []).map((object: LocateObject) => ({ id: String(object.id), description: String(object.description || object.id) }))
        if (!image || !width || !height || !objects.length) { send(400, { error: 'image, width, height and objects are required' }); return }
        const job = enqueue('locate', () => locateWithCodex(image, width, height, objects).then(({ spots }) => ({ spots })))
        send(202, { job: job.id })
        return
      }
      send(404, { error: 'not found' })
    } catch (error) {
      send(400, { error: (error as Error).message })
    }
  })
  server.listen(options.port, '127.0.0.1')
  return server
}

const readJson = (req: http.IncomingMessage) => new Promise<Record<string, unknown>>((resolve, reject) => {
  let size = 0
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => {
    size += chunk.length
    if (size > MAX_BODY) { reject(new Error('request too large')); req.destroy() } else chunks.push(chunk)
  })
  req.on('end', () => {
    try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')) } catch { reject(new Error('body must be JSON')) }
  })
  req.on('error', reject)
})

// The relay window: forwards {id, path, body, token} from an allowed opener to
// this bridge and posts the answer back. It holds no secret of its own.
const relayPage = (origins: string[], version: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>LessonML bridge</title>
<style>body{margin:0;font:14px/1.5 -apple-system,"PingFang SC",sans-serif;background:#0d1416;color:#f5efe4;display:grid;place-items:center;height:100vh;text-align:center}
b{color:#7fe0d4}small{opacity:.6}</style></head>
<body><div><b>LessonML bridge ${version}</b><br><span id="s">waiting for the studio…</span><br><small>Keep this window open (you can minimize it) while pictures are drawn.</small></div>
<script>
const ALLOWED = ${JSON.stringify(origins)}
const status = document.getElementById('s')
let jobs = 0
window.addEventListener('message', async (event) => {
  if (!ALLOWED.includes(event.origin)) return
  const { id, path, body, token } = event.data || {}
  if (!id || typeof path !== 'string' || !path.startsWith('/')) return
  status.textContent = 'connected to ' + event.origin + (body ? ' · working (' + (++jobs) + ')' : '')
  try {
    const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const json = await response.json().catch(() => ({}))
    event.source.postMessage({ id, status: response.status, json }, event.origin)
  } catch (error) {
    event.source.postMessage({ id, status: 0, json: { error: String(error) } }, event.origin)
  }
})
if (window.opener) for (const origin of ALLOWED) { try { window.opener.postMessage({ lessonmlRelay: 'ready' }, origin) } catch {} }
</script></body></html>`
