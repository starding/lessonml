// Screenshots through headless Chrome (playwright-core, no bundled browser).
// The package root is served on a local port so the player loads as modules.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { World } from '../catalog.js'

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json' }

interface Running { server: http.Server; port: number; browser: { newPage: (options: object) => Promise<PageLike>; close: () => Promise<void> } }
interface PageLike {
  goto(url: string): Promise<unknown>
  waitForFunction(fn: string): Promise<unknown>
  evaluate<T>(fn: (arg: never) => T, arg: unknown): Promise<T>
  screenshot(options: object): Promise<Buffer>
  close(): Promise<void>
}

let running: Promise<Running> | null = null

const start = (root: string) => {
  running ??= (async () => {
    const server = http.createServer((req, res) => {
      const file = path.join(root, decodeURIComponent((req.url || '/').split('?')[0]))
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    let playwright: { chromium: { launch: (options: object) => Promise<Running['browser']> } }
    try {
      playwright = await import('playwright-core') as never
    } catch {
      server.close()
      throw new Error('render_preview needs the optional dependency playwright-core: npm install playwright-core')
    }
    const executablePath = process.env.LESSONML_CHROME
    const browser = await playwright.chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' }).catch((error: Error) => {
      server.close()
      throw new Error(`could not start Chrome (${error.message.split('\n')[0]}). Install Google Chrome or set LESSONML_CHROME to a Chromium binary.`)
    })
    return { server, port, browser }
  })()
  running.catch(() => { running = null })
  return running
}

export interface PreviewShot { frame: number; png: string; description: unknown }

export async function renderPreviews(options: { root: string; source: string; world: World; frames: number[]; stylePack: string; width: number; height: number }): Promise<PreviewShot[]> {
  const { port, browser } = await start(options.root)
  const shots: PreviewShot[] = []
  for (const frame of options.frames) {
    const page = await browser.newPage({ viewport: { width: options.width, height: options.height }, deviceScaleFactor: 2 })
    try {
      await page.goto(`http://127.0.0.1:${port}/playground/preview.html`)
      await page.waitForFunction('window.lmlReady === true')
      const description = await page.evaluate(
        ((input: { source: string; world: World; step: number; stylePack: string }) => (window as unknown as { lmlPreview: (arg: unknown) => Promise<unknown> }).lmlPreview(input)) as never,
        { source: options.source, world: options.world, step: frame, stylePack: options.stylePack }
      )
      const png = await page.screenshot({ type: 'png' })
      shots.push({ frame, png: png.toString('base64'), description })
    } finally {
      await page.close()
    }
  }
  return shots
}

export async function closePreviews() {
  if (!running) return
  const { server, browser } = await running.catch(() => ({ server: null, browser: null }) as never as Running)
  await browser?.close()
  server?.close()
  running = null
}
