// Classroom set: a bright room with a whiteboard and one mentor beside it.
// Built for the math acceptance lesson; nothing in it is about language.
//
// Stage: camera wide | mentor | board; "! board <text>" writes on the board
// (" | " starts a new line). Ids are prefixed with `cr-`.

import { renderCharacter } from '../rig/rig.js'
import type { SetDefinition } from './types.js'

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const CLASSROOM_SHOTS = {
  wide: { x: 40, y: 60, w: 1120, h: 840 },
  mentor: { x: 60, y: 340, w: 420, h: 460 },
  board: { x: 410, y: 120, w: 730, h: 470 }
}

const CSS = `
.cr-board-text { font-family:"Chalkboard SE","Comic Sans MS","Segoe Print",ui-rounded,sans-serif; fill:#1e3a6e; }
.cr-fade { transition:opacity .5s ease; }
`

export const CLASSROOM_SET: SetDefinition = {
  id: 'classroom',
  slots: ['mentor'],
  shots: CLASSROOM_SHOTS,
  establishing: 'wide',
  defaultShot: 'wide',
  build(ctx) {
    const mentor = ctx.cast('mentor')
    const figure = mentor?.spec ? renderCharacter(mentor.spec, ctx.style, 'cr-m') : ''
    const line = ctx.style.outline ? `stroke="${ctx.style.outline.color === 'auto' ? '#3a3a48' : ctx.style.outline.color}" stroke-width="${ctx.style.outline.width}"` : ''
    const flat = !ctx.style.gradients
    return `<style>${CSS}</style>
    <defs>
      <linearGradient id="cr-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6efe2"/><stop offset="1" stop-color="#e7dcc8"/></linearGradient>
      <linearGradient id="cr-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd0f2"/><stop offset="1" stop-color="#dff0fb"/></linearGradient>
      <radialGradient id="cr-sun" cx=".2" cy=".2" r=".9"><stop offset="0" stop-color="#fff6d8" stop-opacity=".7"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></radialGradient>
    </defs>
    <g data-camera>
      <rect x="-3000" y="-3000" width="7200" height="7400" fill="${flat ? '#efe6d6' : 'url(#cr-wall)'}"/>
      <g class="px" data-f=".5">
        <rect x="60" y="120" width="300" height="300" fill="${flat ? '#bfe0f5' : 'url(#cr-sky)'}" ${line}/>
        <circle cx="120" cy="190" r="34" fill="#ffe7a3" opacity=".9"/>
        <path d="M60 380 C120 330 180 350 240 320 C290 300 330 330 360 320 L360 420 L60 420 Z" fill="#8cc58a"/>
        <path d="M210 2 V120" stroke="#cbbfa8" stroke-width="0"/>
        <rect x="60" y="120" width="300" height="300" fill="none" stroke="#cbb89a" stroke-width="12"/>
        <path d="M210 120 V420 M60 270 H360" stroke="#cbb89a" stroke-width="6"/>
      </g>
      <rect x="-3000" y="-3000" width="7200" height="7400" fill="url(#cr-sun)" opacity="${flat ? 0 : 1}"/>
      <rect x="420" y="130" width="710" height="440" rx="10" fill="#fbfdff" ${line || 'stroke="#c9ced8" stroke-width="3"'}/>
      <rect x="420" y="130" width="710" height="440" rx="10" fill="none" stroke="#9aa3b2" stroke-width="10"/>
      <rect x="470" y="570" width="610" height="14" rx="4" fill="#9aa3b2"/>
      <rect x="980" y="560" width="46" height="10" rx="3" fill="#e5484d"/><rect x="1034" y="560" width="46" height="10" rx="3" fill="#2f6fd6"/>
      <g id="cr-board" class="cr-fade"></g>
      <rect x="-3000" y="820" width="7200" height="3000" fill="#c9ab84" ${line}/>
      <path d="M-3000 820 H4200" stroke="#b08f68" stroke-width="3"/>
      <g class="px" data-f="1.2">
        <rect x="960" y="700" width="200" height="120" rx="6" fill="#a9825a" ${line}/>
        <path d="M1010 700 C990 620 1040 600 1050 560 C1070 610 1110 620 1090 700 Z" fill="#6aa86a" ${line}/>
      </g>
      <g transform="translate(90,372) scale(.95)">${figure}</g>
    </g>`
  },
  stage(frame, rt) {
    const text = frame.stage.args.board || ''
    if (rt.memo.board === text) return
    rt.memo.board = text
    const board = rt.q('#cr-board')
    if (!board) return
    const lines = text.split(' | ').filter(Boolean)
    const size = lines.length > 2 ? 46 : 64
    board.innerHTML = lines.map((content, index) =>
      `<text class="cr-board-text" x="775" y="${350 - ((lines.length - 1) * size * 0.6) + index * size * 1.25}" text-anchor="middle" font-size="${size}">${escape(content)}</text>`).join('')
  }
}
