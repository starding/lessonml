// Harbor office set: a desk in Hangzhou at night, a video call with New York
// on the monitor. Characters are drawn by the rig with the active style pack;
// the room is placeholder vector art. Every id is prefixed with `hs-`.

/* eslint-disable max-len */
import { renderCharacter } from '../rig/rig.js'
import type { StylePack } from '../rig/styles.js'
import type { Frame } from '../player/session.js'
import type { CastMember, SetDefinition, SetRuntime } from './types.js'
export interface HarborContext {
  style: StylePack
  // Slots this set draws: the main call window and the small tile.
  cast: { call?: CastMember; tile?: CastMember }
}

const slot = (ctx: HarborContext, name: 'call' | 'tile', prefix: string) => {
  const member = ctx.cast[name]
  return member?.spec ? renderCharacter(member.spec, ctx.style, prefix) : ''
}

const seededRandom = (seed: number) => {
  let state = seed
  return () => (state = (state * 16807) % 2147483647) / 2147483647
}

const escapeSvgText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Two lines per option on the in-scene monitor.
export const wrapOption = (text: string): [string, string] => {
  const words = escapeSvgText(text).split(' ')
  const total = words.join(' ').length
  let first = ''
  for (const word of words) {
    if (first && (first.length + 1 + word.length) > Math.max(30, Math.ceil(total / 2))) break
    first = first ? `${first} ${word}` : word
  }
  return [first, words.join(' ').slice(first.length).trim()]
}

function cityTowers(rnd: () => number, x0: number, x1: number, base: number, minH: number, maxH: number, color: string, litColor: string, density: number) {
  let out = '', x = x0;
  while (x < x1) {
    const w = 34 + rnd() * 56, h = minH + rnd() * (maxH - minH);
    out += `<rect x="${x}" y="${base-h}" width="${w}" height="${h}" fill="${color}"/>`;
    if (rnd() < .35) out += `<rect x="${x+w/2-1}" y="${base-h-24}" width="2" height="24" fill="${color}"/><circle cx="${x+w/2}" cy="${base-h-25}" r="2.2" fill="#ff5a4d" class="twinkle" style="animation-delay:${(rnd()*3).toFixed(2)}s"/>`;
    for (let wy = base - h + 10; wy < base - 8; wy += 12) for (let wx = x + 5; wx < x + w - 7; wx += 9)
      if (rnd() < density) out += `<rect x="${wx.toFixed(1)}" y="${wy}" width="4" height="5" fill="${litColor}" opacity="${(.35+rnd()*.6).toFixed(2)}" ${rnd()<.08?`class="twinkle" style="animation-delay:${(rnd()*3).toFixed(2)}s"`:''}/>`;
    x += w + 4 + rnd() * 10;
  }
  return out;
}
function pagoda(cx: number, base: number) {
  let out = `<ellipse cx="${cx}" cy="${base-60}" rx="90" ry="80" fill="#ffb35a" opacity=".22" filter="url(#blur18)"/>`;
  let y = base, w = 46;
  for (let i = 0; i < 5; i++) {
    const h = 15 - i;
    out += `<rect x="${cx-w/2}" y="${y-h}" width="${w}" height="${h}" fill="#f2b45e" opacity=".9"/>`;
    out += `<path d="M${cx-w/2-9} ${y-h} L${cx+w/2+9} ${y-h} L${cx+w/2} ${y-h-5} L${cx-w/2} ${y-h-5} Z" fill="#3a2418"/>`;
    for (let k = 0; k < 3; k++) out += `<rect x="${cx-w/2+6+k*(w-14)/2}" y="${y-h+4}" width="3" height="6" fill="#fff1c2" opacity=".9"/>`;
    y -= h + 5; w -= 6;
  }
  out += `<path d="M${cx} ${y-18} L${cx-6} ${y} L${cx+6} ${y} Z" fill="#3a2418"/>`;
  return out;
}

const SCREEN = { x:250, y:520, w:700, h:394 };
function screenViews(rnd: () => number, ctx: HarborContext) {
  const callName = escapeSvgText(ctx.cast.call?.name || '')
  const tileName = escapeSvgText(ctx.cast.tile?.name || '')
  const books = Array.from({ length: 18 }, (_, i) => `<rect x="${482+i*11}" y="${(i%3===0?192:198)}" width="9" height="${i%3===0?44:38}" fill="${['#9c6b5a','#5e6f8f','#c9a86a','#7d8b6a','#a2777f'][i%5]}" opacity=".8"/>`).join('');
  const books2 = Array.from({ length: 16 }, (_, i) => `<rect x="${486+i*12}" y="${(i%4===1?268:274)}" width="10" height="${i%4===1?42:36}" fill="${['#6f7d99','#b98d6a','#8d6a7d','#c7bfa4'][i%4]}" opacity=".8"/>`).join('');
  return `
  <!-- CALL: Priya's New York office, Dana's tile -->
  <g id="v-call" class="fade">
    <rect width="700" height="394" fill="url(#nyWall)"/>
    <rect x="22" y="22" width="230" height="290" fill="url(#nySky)"/>
    <g fill="#b6c4d3">${cityTowers(rnd, 22, 252, 312, 60, 220, '#b8c6d4', '#dfe9f2', .25)}</g>
    <rect x="22" y="22" width="230" height="290" fill="none" stroke="#c9bdae" stroke-width="8"/>
    <path d="M137 22 V312 M22 167 H252" stroke="#c9bdae" stroke-width="5"/>
    <polygon points="252,40 252,300 470,394 380,394" fill="#fff" opacity=".16"/>
    <rect x="470" y="140" width="214" height="254" fill="#8a6f58"/>
    <rect x="476" y="146" width="202" height="242" fill="#6e5643"/>
    <path d="M476 238 H678 M476 312 H678" stroke="#8a6f58" stroke-width="6"/>${books}${books2}
    <g transform="translate(226,92) scale(.62)">${slot(ctx, 'call', 'm')}</g>
    <g id="typing" class="fade" style="opacity:0">
      <rect x="18" y="16" width="148" height="26" rx="13" fill="rgba(20,22,40,.55)"/>
      <text x="32" y="33" font-size="12" fill="#fff" font-family="-apple-system,Arial">⌨ ${callName} is taking notes</text>
    </g>
    <!-- Dana tile -->
    <g>
      <clipPath id="danaClip"><rect x="500" y="14" width="186" height="112" rx="10"/></clipPath>
      <g clip-path="url(#danaClip)">
        <rect x="500" y="14" width="186" height="112" fill="#141a2e"/>
        <rect x="500" y="14" width="186" height="112" fill="url(#danaGlow)"/>
        <rect x="514" y="26" width="38" height="52" fill="#2a3557" opacity=".9"/><path d="M520 70 L534 46 L546 70 Z" fill="#ff7a3d" opacity=".6"/>
        <g transform="translate(524,4) scale(.36)">${slot(ctx, 'tile', 't')}</g>
      </g>
      <rect x="500" y="14" width="186" height="112" rx="10" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.5" id="danaFrame"/>
      <text x="510" y="118" font-size="10" fill="#fff" font-family="-apple-system,Arial" opacity=".9">${tileName}</text>
    </g>
    <rect y="330" width="700" height="64" fill="url(#callFade)"/>
    <rect x="16" y="352" width="226" height="26" rx="13" fill="rgba(10,12,24,.55)"/>
    <text x="28" y="369" font-size="11.5" fill="#fff" font-family="-apple-system,Arial">${callName} · New York 10:10 AM</text>
    <g transform="translate(350,365)">
      <circle cx="-40" r="13" fill="rgba(255,255,255,.18)"/><circle cx="0" r="13" fill="rgba(255,255,255,.18)"/><circle cx="40" r="13" fill="#e5484d"/>
      <rect x="-44" y="-7" width="8" height="12" rx="4" fill="#fff"/><rect x="-6" y="-5" width="12" height="9" rx="2" fill="#fff"/><rect x="34" y="-2" width="12" height="4" rx="2" fill="#fff"/>
    </g>
    <!-- Regulator mail (ep2-5) -->
    <g id="mail" class="slide" style="transform:translateY(-140px);opacity:0">
      <rect x="170" y="14" width="360" height="104" rx="12" fill="#fff" filter="url(#shadow)"/>
      <rect x="170" y="14" width="6" height="104" rx="3" fill="#e5484d"/>
      <text x="190" y="38" font-size="11" fill="#e5484d" font-weight="700" font-family="-apple-system,Arial">● FORWARDED · HIGH PRIORITY</text>
      <text x="190" y="62" font-size="15" fill="#151826" font-weight="700" font-family="-apple-system,Arial">FW: Inquiry from the regulator</text>
      <text x="190" y="80" font-size="15" fill="#151826" font-weight="700" font-family="-apple-system,Arial">about your AI assistant</text>
      <text x="190" y="104" font-size="11.5" fill="#6b7088" font-family="-apple-system,Arial">Office of Investor Protection · 6 hours after launch</text>
    </g>
  </g>

  <!-- SHARE: the retail page, the disclosure that was never on -->
  <g id="v-share" class="fade" style="opacity:0">
    <rect width="700" height="394" fill="#f4f6fb"/>
    <rect width="700" height="44" fill="#fff"/><circle cx="26" cy="22" r="8" fill="#16b8d9"/>
    <text x="42" y="28" font-size="16" font-weight="800" fill="#141826" font-family="-apple-system,Arial">Ledger</text>
    <rect x="106" y="12" width="84" height="20" rx="10" fill="#eef2f8"/><text x="116" y="26" font-size="11" fill="#6b7088" font-family="-apple-system,Arial">Retail · Beta</text>
    <rect x="236" y="60" width="240" height="38" rx="19" fill="#16b8d9"/>
    <text x="256" y="84" font-size="16" fill="#fff" font-family="-apple-system,Arial">Did NVTK beat earnings?</text>
    <rect x="40" y="112" width="436" height="112" rx="16" fill="#fff" stroke="#e3e7ef"/>
    <g font-size="17" fill="#232838" font-family="-apple-system,Arial">
      <text x="58" y="142">Yes — revenue rose 18%, and analysts</text>
      <text x="58" y="168">call it “a clean beat.” Shares may</text>
      <text x="58" y="194">jump tomorrow.</text>
    </g>
    <g id="discBox" class="fade" style="opacity:0">
      <rect x="40" y="240" width="436" height="78" rx="14" fill="rgba(229,72,77,.06)" stroke="#e5484d" stroke-width="2" stroke-dasharray="8 6" class="alarm"/>
      <text x="58" y="270" font-size="16" font-weight="800" fill="#c8323a" font-family="-apple-system,Arial">⚠ Risk disclosure — not shown</text>
      <text x="58" y="296" font-size="13.5" fill="#8a5a5e" font-family="-apple-system,Arial">Setting was never turned on</text>
      <rect x="410" y="262" width="46" height="26" rx="13" fill="#cfd5e2"/><circle cx="424" cy="275" r="10" fill="#fff"/>
    </g>
  </g>

  <!-- LOGS: last night's answer, three sentences, one is invented -->
  <g id="v-logs" class="fade" style="opacity:0">
    <rect width="700" height="394" fill="#0a1120"/>
    <path d="M0 0 H700" stroke="#16b8d9" stroke-width="3"/>
    <text x="160" y="66" font-size="11.5" fill="#5f7aa6" font-family="ui-monospace,Menlo,monospace">ledger.log · answer #4182 · Nov 7, 21:42 ET</text>
    <g id="logOptions"></g>
    <g id="rule" class="fade" style="opacity:0" font-family="ui-monospace,Menlo,monospace" font-size="12.5" fill="#5fe3ff">
      <text x="160" y="352">&gt; RULE_01: say what you cannot verify.</text>
      <text x="160" y="370" fill="#5f7aa6">&gt; awaiting operator decision_</text>
      ${Array.from({length:9},(_,i)=>`<rect x="${470+i*8}" y="336" width="4" height="24" rx="2" class="wave" style="animation-delay:${(i*0.09).toFixed(2)}s"/>`).join('')}
    </g>
  </g>

  <!-- SEARCH: the source does not exist -->
  <g id="v-search" class="fade" style="opacity:0">
    <rect width="700" height="394" fill="#f6f7fb"/>
    <rect width="700" height="36" fill="#e9ecf3"/>
    <circle cx="20" cy="18" r="5" fill="#ff6159"/><circle cx="38" cy="18" r="5" fill="#ffbd2e"/><circle cx="56" cy="18" r="5" fill="#28c941"/>
    <rect x="110" y="62" width="440" height="48" rx="24" fill="#fff" stroke="#d6dbe6" stroke-width="1.5"/>
    <text x="134" y="92" font-size="18" fill="#232838" font-family="-apple-system,Arial" id="searchText"></text>
    <g id="searchResult" class="fade" style="opacity:0" font-family="-apple-system,Arial">
      <text x="120" y="160" font-size="24" font-weight="800" fill="#141826">0 results</text>
      <text x="120" y="190" font-size="15" fill="#6b7088">No report, filing, or press release matches</text>
      <text x="120" y="212" font-size="15" fill="#6b7088" id="searchEcho"></text>
      <g transform="translate(330,270) rotate(-8)">
        <rect x="-120" y="-30" width="240" height="60" rx="8" fill="none" stroke="#e5484d" stroke-width="4"/>
        <text x="0" y="10" text-anchor="middle" font-size="22" font-weight="900" fill="#e5484d" letter-spacing="2">SOURCE NOT FOUND</text>
      </g>
    </g>
  </g>

  <!-- Priya picture-in-picture while the screen is shared -->
  <g id="pip" class="fade" style="opacity:0">
    <clipPath id="pipClip"><rect x="556" y="12" width="132" height="96" rx="10"/></clipPath>
    <g clip-path="url(#pipClip)"><rect x="556" y="12" width="132" height="96" fill="url(#nyWall)"/>
      <g transform="translate(568,18) scale(.27)">${slot(ctx, 'call', 'p')}</g></g>
    <rect x="556" y="12" width="132" height="96" rx="10" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.5"/>
  </g>`;
}

function buildWorld(ctx: HarborContext) {
  const rnd = seededRandom(7)
  const rain = Array.from({ length: 90 }, (_, i) => `<line class="drop" x1="0" y1="0" x2="0" y2="0" stroke="#bcd3ff" stroke-width="${(1+rnd()*.8).toFixed(1)}" opacity="${(.12+rnd()*.25).toFixed(2)}"/>`).join('');
  const beads = Array.from({ length: 46 }, () => { const x = 130+rnd()*940, y = 130+rnd()*680, r = 1.5+rnd()*3.5;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="rgba(190,210,255,.10)" stroke="rgba(220,235,255,.25)" stroke-width=".8"/><circle cx="${(x-r*.3).toFixed(1)}" cy="${(y-r*.3).toFixed(1)}" r="${(r*.3).toFixed(1)}" fill="#fff" opacity=".5"/>`; }).join('');
  return `
  <defs>
    <filter id="blur18" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-opacity=".25"/></filter>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070a22"/><stop offset=".55" stop-color="#1a1d48"/><stop offset="1" stop-color="#3d2c52"/></linearGradient>
    <linearGradient id="lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f45"/><stop offset="1" stop-color="#070915"/></linearGradient>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0d1c"/><stop offset="1" stop-color="#07070f"/></linearGradient>
    <linearGradient id="desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#231b26"/><stop offset="1" stop-color="#09080d"/></linearGradient>
    <linearGradient id="curtain" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#140f22"/><stop offset=".5" stop-color="#2a1f3d"/><stop offset="1" stop-color="#120d1d"/></linearGradient>
    <linearGradient id="nyWall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1e9dd"/><stop offset="1" stop-color="#cdbfae"/></linearGradient>
    <linearGradient id="nySky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bcd7f0"/><stop offset="1" stop-color="#eef3f7"/></linearGradient>
    <linearGradient id="callFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
    <radialGradient id="danaGlow" cx=".7" cy=".4" r=".9"><stop offset="0" stop-color="#3a6bd6" stop-opacity=".55"/><stop offset="1" stop-color="#3a6bd6" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" id="glowStop" style="stop-color:#ffd2a8;transition:stop-color .8s" stop-opacity=".55"/><stop offset="1" style="stop-color:#ffd2a8" stop-opacity="0" id="glowStop2"/></radialGradient>
    <clipPath id="windowClip"><rect x="120" y="120" width="960" height="700"/></clipPath>
    <clipPath id="screenClip"><rect width="700" height="394" rx="4"/></clipPath>
  </defs>
  <g id="cam" data-camera>
    <rect x="-3000" y="-3000" width="7200" height="7400" fill="url(#wall)"/>
    <g clip-path="url(#windowClip)">
      <g class="px" data-f=".25"><rect x="60" y="60" width="1080" height="820" fill="url(#sky)"/>
        <ellipse cx="760" cy="640" rx="420" ry="120" fill="#ff8a5a" opacity=".12" filter="url(#blur18)"/></g>
      <g class="px" data-f=".4">
        <path d="M60 640 C180 560 300 590 380 560 C460 532 540 600 640 620 L640 660 L60 660 Z" fill="#12153a"/>
        ${pagoda(380, 566)}
        <rect x="60" y="640" width="1080" height="240" fill="url(#lake)"/>
        ${Array.from({length:14},(_,i)=>`<rect x="${372+rnd()*16}" y="${660+i*11}" width="${8+rnd()*20}" height="2" fill="#f2b45e" opacity="${(.5-i*.03).toFixed(2)}"/>`).join('')}
      </g>
      <g class="px" data-f=".6">${cityTowers(rnd, 640, 1100, 646, 120, 470, '#0d1030', '#ffd89a', .22)}
        ${Array.from({length:30},()=>`<rect x="${640+rnd()*440}" y="${662+rnd()*150}" width="${10+rnd()*30}" height="2" fill="#ffd89a" opacity="${(.15+rnd()*.3).toFixed(2)}"/>`).join('')}</g>
      <g id="rain">${rain}</g>
      ${beads}
      <rect x="120" y="120" width="960" height="700" fill="url(#sky)" opacity=".08"/>
    </g>
    <g class="px" data-f=".85">
      <rect x="112" y="112" width="976" height="716" fill="none" stroke="#04050b" stroke-width="18"/>
      <path d="M600 120 V820" stroke="#04050b" stroke-width="12"/>
      <rect x="96" y="820" width="1008" height="22" fill="#0e0d16"/>
      <path class="curtain" d="M40 60 C70 300 30 560 70 880 L-200 880 L-200 60 Z" fill="url(#curtain)"/>
      <path class="curtain" d="M1160 60 C1130 300 1170 560 1130 880 L1400 880 L1400 60 Z" fill="url(#curtain)"/>
    </g>
    <ellipse cx="600" cy="740" rx="560" ry="420" fill="url(#glow)" id="glowEllipse"/>
    <rect x="-3000" y="920" width="7200" height="3000" fill="url(#desk)"/>
    <path d="M-3000 920 H4200" stroke="#3a2c3a" stroke-width="2"/>
    <ellipse cx="600" cy="960" rx="420" ry="40" fill="url(#glow)" opacity=".8"/>
    <g id="monitor">
      <rect x="575" y="914" width="50" height="62" fill="#0b0c12"/>
      <ellipse cx="600" cy="980" rx="120" ry="14" fill="#0c0d14"/>
      <rect x="236" y="506" width="728" height="422" rx="14" fill="#06070c" stroke="#1d2030" stroke-width="2"/>
      <g transform="translate(${SCREEN.x},${SCREEN.y})" clip-path="url(#screenClip)" id="screen">${screenViews(rnd, ctx)}</g>
      <rect x="250" y="520" width="700" height="394" rx="4" fill="url(#sky)" opacity=".05" pointer-events="none"/>
    </g>
    <path d="M370 1030 L830 1030 L860 1100 L340 1100 Z" fill="#101019" stroke="#2a2a3a"/>
    ${Array.from({length:4},(_,r)=>Array.from({length:14},(_,c)=>`<rect x="${380+c*32+r*-6}" y="${1040+r*14}" width="26" height="10" rx="2" fill="#191a26" stroke="#6b5cff" stroke-opacity=".18"/>`).join('')).join('')}
    <g id="phone"><rect x="160" y="1040" width="74" height="132" rx="12" fill="#0c0c14" stroke="#2a2a3a" transform="rotate(-14 197 1106)"/>
      <rect id="phoneScreen" x="166" y="1046" width="62" height="120" rx="9" fill="#ff5a5a" opacity="0" transform="rotate(-14 197 1106)" style="transition:opacity .4s"/></g>
    <g transform="translate(980,1010)">
      <path d="M-34 0 L34 0 L28 70 C26 80 -26 80 -28 70 Z" fill="#e9e3da"/>
      <path d="M34 14 C58 14 58 50 30 50" fill="none" stroke="#e9e3da" stroke-width="8"/>
      <ellipse cx="0" cy="0" rx="34" ry="8" fill="#3b2318"/>
      <path class="steam" d="M-10 -8 C-20 -24 0 -32 -8 -48" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".4"/>
      <path class="steam" style="animation-delay:1.4s" d="M8 -8 C0 -24 18 -32 10 -50" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".4"/>
    </g>
    <g class="px" data-f="1.35" opacity=".9">
      <path d="M-120 1400 C-60 1200 40 1120 120 1080 C80 1180 40 1260 30 1400 Z" fill="#05060a" filter="url(#blur6)"/>
      <path d="M-60 1400 C0 1260 100 1200 190 1180 C130 1250 90 1320 80 1400 Z" fill="#070810" filter="url(#blur6)"/>
    </g>
  </g>`;
}


export const HARBOR_SCREEN = SCREEN

// Shots are world rectangles; the engine fits them into the visible area.
const S = (x: number, y: number, w: number, h: number) => ({ x: SCREEN.x + x, y: SCREEN.y + y, w, h })
export const HARBOR_SHOTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  wide: { x: 150, y: 110, w: 900, h: 1000 },
  push: { x: 230, y: 430, w: 740, h: 600 },
  screen: { x: SCREEN.x - 10, y: SCREEN.y - 10, w: SCREEN.w + 20, h: SCREEN.h + 20 },
  priya: S(250, 72, 200, 300),
  dana: S(500, 14, 186, 112),
  share: S(30, 50, 470, 284),
  mail: S(160, 6, 380, 210),
  logs: S(146, 46, 408, 334),
  search: S(100, 50, 500, 290)
}

const SCENE_CSS = `
.hs-root .fade{transition:opacity .6s ease}
.hs-root .slide{transition:transform .7s cubic-bezier(.2,.8,.2,1),opacity .5s ease}
.hs-root .opt{cursor:pointer}
.hs-root .opt rect{transition:fill .25s,stroke .25s}
.hs-root .opt.live rect{animation:hs-pulse 1.8s ease-in-out infinite}
.hs-root .opt.live:hover rect{fill:rgba(95,227,255,.12);stroke:rgba(95,227,255,.7)}
.hs-root .opt.wrong rect{fill:rgba(255,77,77,.16);stroke:#ff6b6b}
.hs-root .opt.right rect{fill:rgba(95,227,255,.18);stroke:#5fe3ff}
.hs-root .twinkle{animation:hs-tw 3.2s ease-in-out infinite}
.hs-root .steam{animation:hs-steam 4s ease-in-out infinite}
.hs-root .alarm{animation:hs-alarm 1s ease-in-out infinite}
.hs-root .wave{transform-box:fill-box;transform-origin:center;animation:hs-wave .9s ease-in-out infinite}
@keyframes hs-pulse{50%{stroke:rgba(95,227,255,.55)}}
@keyframes hs-tw{50%{opacity:.25}}
@keyframes hs-steam{0%{transform:translateY(8px);opacity:0}30%{opacity:.5}100%{transform:translateY(-36px);opacity:0}}
@keyframes hs-alarm{50%{opacity:.35}}
@keyframes hs-wave{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
`

const prefixIds = (markup: string) => markup
  .replace(/\bid="([^"]+)"/g, 'id="hs-$1"')
  .replace(/url\(#([^)]+)\)/g, 'url(#hs-$1)')
  .replace(/href="#([^"]+)"/g, 'href="#hs-$1"')

export const buildHarborOfficeSvg = (ctx: HarborContext) =>
  `<style>${SCENE_CSS}</style>${prefixIds(buildWorld(ctx))}`

// Options of a pick-evidence interaction, drawn as lines of the log on the monitor.
export const logOptionsMarkup = (options: string[]) => options.slice(0, 3).map(wrapOption).map((lines, i) => `
  <g class="opt" data-i="${i}">
    <rect x="156" y="${84 + i * 82}" width="388" height="66" rx="10" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.12)" stroke-width="1.5"/>
    <text x="170" y="${110 + i * 82}" font-size="12" fill="#5fe3ff" font-family="ui-monospace,Menlo,monospace">[${i + 1}]</text>
    <text x="200" y="${110 + i * 82}" font-size="18" fill="#e9eeff" font-family="-apple-system,Arial">${lines[0]}</text>
    <text x="200" y="${134 + i * 82}" font-size="18" fill="#e9eeff" font-family="-apple-system,Arial">${lines[1]}</text>
  </g>`).join('')

// ── Set definition: how a frame's stage looks in this room ─────────────────
const GLOW: Record<string, string> = { call: '#ffd2a8', share: '#e6eeff', logs: '#5fe3ff', search: '#e6eeff' }

const typeSearch = (rt: SetRuntime, query: string) => {
  const text = rt.q('#hs-searchText'), result = rt.q('#hs-searchResult'), echo = rt.q('#hs-searchEcho')
  if (!text || !result) return
  if (echo) echo.textContent = `“${query}”.`
  result.style.opacity = '0'
  let typed = 0
  const tick = () => {
    if (rt.memo.search !== query || rt.memo.searchSettled) return
    text.textContent = query.slice(0, ++typed)
    if (typed < query.length) rt.later(tick, 45)
    else rt.later(() => { result.style.opacity = '1'; rt.shake(8) }, 350)
  }
  tick()
}

const hostsPick = (frame: Frame) => frame.kind === 'interaction' && frame.step.component === 'lessonml:pick-evidence' && (frame.stage.screen || 'call') === 'logs'

export const HARBOR_OFFICE_SET: SetDefinition = {
  id: 'harbor-office',
  slots: ['call', 'tile'],
  shots: HARBOR_SHOTS,
  establishing: 'wide',
  defaultShot: 'screen',
  build: (ctx) => buildHarborOfficeSvg({ style: ctx.style, cast: { call: ctx.cast('call'), tile: ctx.cast('tile') } }),
  hosts: hostsPick,
  stage(frame, rt) {
    const screen = frame.stage.screen || 'call'
    const effects = new Set(frame.stage.effects)
    for (const name of ['call', 'share', 'logs', 'search']) {
      const group = rt.q(`#hs-v-${name}`)
      if (!group) continue
      group.style.opacity = name === screen ? '1' : '0'
      group.style.pointerEvents = name === screen ? 'auto' : 'none'
    }
    const show = (selector: string, on: boolean, value = '1') => { const node = rt.q(selector); if (node) node.style.opacity = on ? value : '0' }
    show('#hs-pip', screen !== 'call')
    // The missing disclosure is a discovery: shown only once a lesson says "! share disclosure".
    show('#hs-discBox', frame.stage.args.share === 'disclosure')
    show('#hs-typing', effects.has('typing'))
    show('#hs-phoneScreen', effects.has('phone') || effects.has('mail'), '0.55')
    show('#hs-rule', effects.has('scan') || effects.has('rule'))
    const mail = rt.q('#hs-mail')
    if (mail) { mail.style.transform = effects.has('mail') ? 'translateY(0)' : 'translateY(-140px)'; mail.style.opacity = effects.has('mail') ? '1' : '0' }
    if (effects.has('shake')) rt.shake(14)
    if (effects.has('scan')) rt.scan()
    let glow = effects.has('mail') ? '#ff5a5a' : GLOW[screen] || GLOW.call
    const query = frame.stage.args.search || ''
    if (screen === 'search' && query) {
      glow = '#ff5a5a'
      if (rt.memo.search !== query) { rt.memo.search = query; rt.memo.searchSettled = false; typeSearch(rt, query) }
    }
    for (const selector of ['#hs-glowStop', '#hs-glowStop2']) { const stop = rt.q(selector); if (stop) stop.style.stopColor = glow }
  },
  surface(frame, rt) {
    const host = rt.q('#hs-logOptions')
    if (!host) return
    if (!hostsPick(frame) || frame.kind !== 'interaction') {
      host.querySelectorAll('.opt').forEach((option) => option.classList.remove('live'))
      return
    }
    if (host.getAttribute('data-for') !== frame.step.id) {
      host.innerHTML = logOptionsMarkup(frame.step.options.map((option) => option.text))
      host.setAttribute('data-for', frame.step.id)
    }
    host.querySelectorAll<SVGElement>('.opt').forEach((option) => {
      const index = Number(option.dataset.i)
      option.classList.toggle('live', !frame.solved)
      option.classList.toggle('right', frame.solved && Boolean(frame.step.options[index]?.correct))
      option.classList.toggle('wrong', !frame.solved && frame.misses[frame.misses.length - 1] === index)
    })
  },
  settle(rt) {
    const query = rt.memo.search as string | undefined
    if (!query) return
    rt.memo.searchSettled = true
    const text = rt.q('#hs-searchText'), result = rt.q('#hs-searchResult')
    if (text) text.textContent = query
    if (result) result.style.opacity = '1'
  },
  tick(rt, dt) {
    const drops = (rt.memo.drops ??= new Map<Element, { x: number; y: number; v: number; l: number }>()) as Map<Element, { x: number; y: number; v: number; l: number }>
    rt.qa('.drop').forEach((drop) => {
      let p = drops.get(drop)
      if (!p) { p = { x: 120 + Math.random() * 960, y: 120 + Math.random() * 700, v: 900 + Math.random() * 500, l: 18 + Math.random() * 26 }; drops.set(drop, p) }
      p.y += p.v * dt; p.x -= p.v * dt * 0.12
      if (p.y > 830) { p.y = 110 - Math.random() * 60; p.x = 140 + Math.random() * 1000 }
      drop.setAttribute('x1', p.x.toFixed(1)); drop.setAttribute('y1', p.y.toFixed(1))
      drop.setAttribute('x2', (p.x + p.l * 0.12).toFixed(1)); drop.setAttribute('y2', (p.y - p.l).toFixed(1))
    })
  }
}
