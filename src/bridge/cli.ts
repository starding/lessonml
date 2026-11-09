#!/usr/bin/env node
// lessonml-bridge: let a web app draw LessonML pages with your own image models.
//
//   npx lessonml-bridge --origin https://www.heatwords.com
//
// Prints a pairing link. The token is kept in ~/.lessonml/bridge.json so you
// pair once; delete that file (or pass --new-token) to revoke every pairing.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { startBridge } from './server.js'
import { codexAvailable, setCodexBinary } from './codex.js'

const argv = process.argv.slice(2)
const values = (flag: string) => argv.flatMap((arg, i) => (arg === flag && argv[i + 1] ? [argv[i + 1]] : arg.startsWith(`${flag}=`) ? [arg.slice(flag.length + 1)] : []))
const value = (flag: string) => values(flag).at(-1)

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`lessonml-bridge [--port 7788] [--origin <url>]... [--studio <url>] [--codex <path>] [--new-token]

Runs on 127.0.0.1 so a web app you trust can use your own Codex to draw
illustrated pages and place their spots. Only the --origin pages may call it,
and only with the pairing token.`)
  process.exit(0)
}

const configDir = path.join(os.homedir(), '.lessonml')
const configFile = path.join(configDir, 'bridge.json')
let config: { token?: string } = {}
try { config = JSON.parse(fs.readFileSync(configFile, 'utf8')) } catch { /* first run */ }
if (!config.token || argv.includes('--new-token')) {
  config.token = crypto.randomBytes(24).toString('base64url')
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 })
}

const port = Number(value('--port') || 7788)
const origins = values('--origin')
if (!origins.length) origins.push('https://www.heatwords.com', 'https://heatwords.com', 'http://localhost:3001')
const studio = value('--studio') || `${origins[0]}/studio`
const codex = value('--codex')
if (codex) setCodexBinary(codex)

const version = JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).version as string
startBridge({ port, token: config.token, origins, version })

const found = await codexAvailable()
console.log(`LessonML bridge ${version} on http://127.0.0.1:${port}`)
console.log(`  codex: ${found ?? 'not found (install it, run "codex login", or pass --codex <path>)'}`)
console.log(`  allowed origins: ${origins.join(', ')}`)
console.log(`\nPair once by opening:\n  ${studio}#bridge=${encodeURIComponent(`http://127.0.0.1:${port}`)}&token=${config.token}\n`)
