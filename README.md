# LessonML

**A screenplay language for interactive, narrative lessons, designed to be written by language models.**

LessonML gives a lesson the shape of a story. A lesson has characters you get to know, places you return to, and scenes where you act: you spot the claim that can't be verified, choose what to say, or say it out loud. Each action produces learning evidence and changes the story.

LessonML is built for models from the first line:

- **The model writes a screenplay.** It is the form models have read the most of, so they write it well.
- **The compiler checks it against a world catalog.** It answers with diagnostics written for the model, for example `PRIYA has no expression "furious". Available: neutral, smile, stern, surprised, worried.`, so the model can repair its own work.
- **Characters are parametric rigs and styles are swappable packs.** A world stays visually consistent no matter who, or which model, adds to it.

```text
# scene call @harbor:office-night
! camera priya
PRIYA (stern): "Without that {disclosure}, the firm's {liability} is very different."
  zh: 没有那段披露，公司要承担的法律责任就完全不一样了。

? lessonml:pick-evidence case-1
  prompt: Tap the sentence Ledger could not {verify}.
  - Revenue rose 18% from a year ago.
    hint: This comes from the filing.
  * An analyst report from Northfield Research calls it "a clean beat."
  on correct: evidence read verify; set trust.priya += 1
  on wrong: PRIYA (stern): "Look again."

if trust.priya > 0:
  PRIYA (smile): "Good. You check before you speak."
```

## Status

This is an early draft. It already includes:

- the screenplay syntax;
- the IR;
- a compiler with model-facing diagnostics;
- four core interaction components;
- a parametric character rig;
- three style packs: anime clean line, contemporary flat and ligne claire;
- a reference interpreter and the `<lml-scene>` web component (v0.2);
- an MCP server for the model authoring loop (v0.3);
- subject-neutral evidence, a glossary, writing tasks with pluggable reviewers, pluggable place sets and an embedded mode, with a math lesson as the acceptance test (v0.4);
- a safe expression layer: formulas, live values in text, numeric answers with tolerance, and slider explorations with goals and live charts (v0.5). See `examples/classroom/compound-interest.lml`.

The full design is in [SPEC.md](SPEC.md).

The project started inside HeatWords, an English-learning app for professionals. Language learning comes first, but the components are meant for every subject.

## Play a lesson in any page

```html
<script type="module" src="lessonml/dist/src/player/element.js"></script>
<lml-scene src="lesson.lml" world="world.json" style-pack="anime-clean"></lml-scene>
```

In standalone mode the element listens to swipes, the wheel and the keyboard. With `controls="host"`, your app drives it with `next()` and `back()` and draws its own navigation; see `playground/embed.html`. It reports learning evidence and story state as DOM events (`lml-evidence`, `lml-state`), so the host app owns the learner's record.

## Let a model write lessons (MCP)

The MCP server gives any MCP client (Claude Code, Claude Desktop, others) the whole authoring loop:
- the guide;
- the world catalog;
- compile, with repairable diagnostics;
- simulate, a played-through transcript;
- `render_preview`, screenshots from headless Chrome.

```bash
npm install && npm run build
claude mcp add lessonml -- node /absolute/path/to/lessonml/dist/src/mcp/server.js
```

Then ask: *"Using lessonml, write a short scene in the harbor world where Dana tests whether I can push back politely."* The model reads the world, writes the screenplay, compiles and fixes it, plays it through, and looks at the screenshots.

`examples/harbor/pitch-at-2am.lml` was written this way. Its first draft compiled cleanly, but `simulate` showed two characters "on camera" while the monitor was showing logs, and a choice that produced no evidence. The previews also caught an empty prompt in the player.

## Install

LessonML is not on npm yet. Install it from GitHub, pinned to a commit; npm builds it on install (`prepare`):

```bash
npm install github:starding/lessonml#<commit>
```

```js
import { compile, LessonSession } from 'lessonml'   // compiler and interpreter (Node or browser)
import 'lessonml/player'                            // registers <lml-scene> (browser only)
```

## Try it

```bash
npm install
npm test                                                   # compiler and rig tests
npm run check -- examples/harbor/compliance-call.lml       # compile an example lesson
npm run serve                                              # playground at http://localhost:4173 (style packs, and the player at /playground/player.html)
```

## Contributing

The unit of contribution is a pack:

- a **world**: characters and places;
- a **style**: drawing rules;
- a **component**: props, events, evidence, an example, and tests.

Every id is namespaced. Open an issue before you add a new core component.

## License

- Code: [Apache-2.0](LICENSE).
- Art, style packs and example worlds (`examples/`, `src/rig/styles.ts` presets): [CC BY 4.0](LICENSE-ASSETS.md).

---

## 中文简介

LessonML 是一种为大模型设计的「剧本式」教学语言，用来写有人物、有地点、可交互、有叙事的课。

- **写作：** 大模型用剧本格式写课，编译器按世界目录检查，并用写给模型看的报错引导它自己修正。
- **画面：** 角色是参数化骨架，画风是可以替换的资源包。谁来加角色，世界都保持一致。
- **学习：** 学习者的每个动作同时写两本账，一本是学习证据，一本是剧情状态。

项目从语言学习起步，目标是成为跨学科的交互式教育组件库。
