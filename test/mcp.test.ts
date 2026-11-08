import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// The server exactly as a model reaches it: a real MCP client over stdio.
const connect = async () => {
  const client = new Client({ name: 'lessonml-test', version: '0.0.0' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/src/mcp/server.js'] }))
  return client
}
const textOf = (result: unknown) => ((result as { content: Array<{ type: string; text?: string }> }).content.filter((part) => part.type === 'text').map((part) => part.text).join('\n'))

test('the authoring loop: guide, world, compile, simulate', async () => {
  const client = await connect()
  try {
    const tools = (await client.listTools()).tools.map((tool) => tool.name).sort()
    assert.deepEqual(tools, ['lessonml_compile', 'lessonml_describe_world', 'lessonml_guide', 'lessonml_render_preview', 'lessonml_simulate'])

    assert.match(textOf(await client.callTool({ name: 'lessonml_guide', arguments: {} })), /lessonml:pick-evidence/)
    assert.match(textOf(await client.callTool({ name: 'lessonml_describe_world', arguments: {} })), /examples\/harbor\/world\.json/)
    assert.match(textOf(await client.callTool({ name: 'lessonml_describe_world', arguments: { world: 'examples/harbor/world.json' } })), /PRIYA \(harbor:priya\)/)

    const ok = textOf(await client.callTool({ name: 'lessonml_compile', arguments: { path: 'examples/harbor/compliance-call.lml' } }))
    assert.match(ok, /^ok: harbor:compliance-call/)
    const broken = textOf(await client.callTool({ name: 'lessonml_compile', arguments: { world: 'examples/harbor/world.json', source: '---\nlesson: harbor:x\n---\n# scene a @harbor:office-night\nPRIYA (furious): "Hi."\n' } }))
    assert.match(broken, /unknown-expression.*Available: neutral/)

    const played = textOf(await client.callTool({ name: 'lessonml_simulate', arguments: { path: 'examples/harbor/compliance-call.lml' } }))
    assert.match(played, /✓ option 1/)
    assert.match(played, /branch line \d+ \(if trust\.priya > 0\): taken/)
    const missed = textOf(await client.callTool({ name: 'lessonml_simulate', arguments: { path: 'examples/harbor/compliance-call.lml', answers: { 'case-1': [0, 2, 1] } } }))
    assert.match(missed, /✗ option 0 .* hint: 这句的数据来自财报原文/)
    assert.match(missed, /evidence: read verify \(after a miss\)/)
  } finally {
    await client.close()
  }
})

const chrome = process.env.LESSONML_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
test('render_preview returns screenshots with a description of each frame', { skip: !fs.existsSync(chrome) && 'no Chrome on this machine', timeout: 90000 }, async () => {
  const client = await connect()
  try {
    const result = await client.callTool({ name: 'lessonml_render_preview', arguments: { path: 'examples/harbor/compliance-call.lml', frames: [0, 5] } }) as { content: Array<{ type: string; data?: string; text?: string }> }
    const images = result.content.filter((part) => part.type === 'image')
    assert.equal(images.length, 2, textOf(result))
    for (const image of images) assert.equal(Buffer.from(image.data!, 'base64').subarray(1, 4).toString(), 'PNG')
    assert.match(textOf(result), /frame 5: .*"kind":"interaction"/)
    fs.mkdirSync('dist/previews', { recursive: true })
    images.forEach((image, i) => fs.writeFileSync(`dist/previews/frame-${i}.png`, Buffer.from(image.data!, 'base64')))
  } finally {
    await client.close()
  }
})
