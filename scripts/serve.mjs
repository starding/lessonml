// Tiny static server for the playground: node scripts/serve.mjs [port]
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const port = Number(process.argv[2] || process.env.PORT || 4173)
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.lml': 'text/plain; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  const file = path.join(root, url === '/' ? 'playground/index.html' : url)
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found')
    return
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}).listen(port, () => console.log(`LessonML playground: http://localhost:${port}/`))
