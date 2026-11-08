# LessonML Specification — v0.1 draft

LessonML is a language for interactive, narrative lessons. Its primary author is a language model. A person's job is to review it and set the taste.

This draft is deliberately small. Every rule should earn its place by making lessons easier for a model to write correctly, or easier for a runtime to play consistently.

## 1. Design principles

1. **Written by models, reviewed by people.** The syntax is a screenplay, because that is the form models have read most of. Machines read a strict intermediate representation (IR), never the text.
2. **Everything is a namespaced id.** Characters, places and components are all named `namespace:name`, for example `harbor:priya` or `lessonml:pick-evidence`. This lets packs from different authors coexist, and a model can tell from the name what a thing is.
3. **What a model may use is in its context.** A world catalog renders as compact text (`describeWorld`). Every entry carries a description written for the model.
4. **Strict gate, forgiving runtime.** The compiler rejects anything the world cannot play. A runtime that meets something unknown degrades to plain text and never crashes.
5. **Diagnostics are written for the model that made the mistake.** Each one says where the problem is, what is wrong, and what would be valid instead. The compiler is the model's teacher.
6. **Behaviour and appearance are separate packs.** A screenplay never names a style. Swapping a resource pack restyles the whole world.
7. **Every learner action writes two ledgers.** One is learning evidence, the other is story state. This is what separates a lesson from a game and from a worksheet.

## 2. Layers

| Layer | What it holds | Lifetime |
|---|---|---|
| World | Characters, places, props, systems; each has identity, description and assets | Persists across lessons |
| Story | Scenes, lines, stage directions, branches; reads and writes state | One lesson, with state carried forward |
| Interaction | Components the learner acts on; they emit events and evidence | One step |

The learner is the protagonist. Their profile and evidence belong to the world layer.

## 3. Catalogs

### 3.1 World

```json
{
  "namespace": "harbor",
  "title": "…",
  "characters": { "priya": { "name": "Priya", "description": "…", "expressions": ["neutral", "stern"], "rig": { } } },
  "places": { "office-night": { "name": "…", "description": "…", "stage": { "camera": ["wide", "priya"], "effect": ["shake"] } } }
}
```

A place declares the stage verbs it understands and the arguments each verb accepts. Directions are checked against the place the scene happens in.

### 3.2 Evidence vocabulary

An evidence event is `(facet, target, outcome)`.

The **target** is a namespaced id: `en:verify` for an English word, `math:fraction-equivalence` for a skill. In `evidence <facet> <target>`, a bare word means `<lesson language>:<word>`.

**Facets** come in packs. A small core is shared by every subject; each subject adds its own:

| Pack | Facets |
|---|---|
| core | `recall`, `apply`, `explain`, `predict` |
| language | `read`, `listen`, `speak`, `write` |
| math | `compute` |

New subjects add packs. They never change the core.

The evidence format is the hardest thing to change later, because learner records, host apps and training data all depend on it. That is why it was made subject-neutral before anything else depended on it.

Outcomes map onto xAPI statements:

| Outcome | xAPI verb |
|---|---|
| attempted | `attempted` |
| correct | `passed` |
| wrong | `failed` |

### 3.3 Components

A component declares:
- its required and optional props;
- its option rules: how many options, and how many may be marked correct;
- the events it emits;
- the evidence facets it can produce;
- an example written for models.

The core set is `lessonml:pick-evidence`, `lessonml:cloze`, `lessonml:choose-reply`, `lessonml:speak` and `lessonml:write`. They started in language learning, but none of them is about language only.

`lessonml:write` is judged by a **reviewer** the host app supplies: an LLM, a teacher queue, a rubric. Without one, the default reviewer checks that the required words are used and the answer is long enough. Feedback is shown as the hint.

### 3.4 Glossary

A world, and optionally a lesson, maps target ids to the sense a term has *here*:

```json
"glossary": { "en:pitch": { "gloss": "提案", "definition": "a short talk to persuade someone" } }
```

```text
glossary:
  pitch: 提案 | a short talk to persuade someone
```

Lesson entries override the world's. When a learner taps a target word, the player reports it with its gloss (`lml-word`). `lessonml_simulate` warns about marked words that have no gloss.

### 3.6 Expressions and live values (v0.5)

Lessons can compute. One small expression language (`src/expr.ts`) is used everywhere a value is needed. It has:
- numbers;
- state and formula names;
- `+ - * / % ^`;
- comparisons, `&& || !`;
- the functions `abs sqrt exp ln log10 sin cos tan floor ceil round min max pow clamp`;
- the constants `pi`, `e` and `g`.

There is no member access, no strings and no assignment. A model can describe a simulation without writing code.

| Where | Example |
|---|---|
| Formulas (front matter) | `balance: principal * (1 + rate) ^ years` |
| Live text, in lines, prompts and board arguments | `"{=round(balance)} dollars"` |
| Conditions | `if balance > 2 * principal && instinct > 0:` |
| State changes | `set years += 5` |
| Numeric answers and goals | `answer: 72 / 6`; `goal: balance >= 2 * principal` |

Formulas are evaluated on demand, so live values follow the state as a learner moves a slider. The compiler rejects:
- unknown names and functions;
- a wrong number of arguments;
- formulas that shadow state;
- formula cycles.

Two components use expressions:
- **`lessonml:numeric`** checks a typed value and optional unit against an `answer` expression within a `tolerance` (`2%` or `0.5`). A wrong value gets "too high" or "too low", or the hint of a matching distractor.
- **`lessonml:explore`** binds sliders to state (`controls: rate 0.01..0.12 step 0.01, years 1..30 step 1`). It is solved when its `goal` becomes true. `lessonml_simulate` searches the controls for a setting that meets the goal, and warns when none exists.

A set can draw live props from expressions. The classroom set's `! plot <formula> over <state> <from>..<to> [line <expr>]` draws a chart that updates as the sliders move, with the current point and a guide line.

### 3.5 Acceptance

`examples/` always contains at least one non-language lesson; today these are `classroom/equal-fractions.lml` and `classroom/compound-interest.lml`. Every format change must keep every example compiling, playing to the end without warnings, and rendering (`test/acceptance.test.ts`). A change that only works for language lessons fails here, not when someone tries to teach physics.

## 4. IR

The IR is defined in `src/ir.ts`. A `Lesson` has an id, a world, a language, initial `state` (numbers only in v0.1) and `scenes`. A `Scene` has a place and a list of steps. A step is one of four kinds:

- **`line`:** a speaker id or `null` for narration, an expression, the text, a translation, and target words.
- **`stage`:** a verb and its arguments.
- **`interaction`:** a component, an id, props, options with hints, and handlers that map event names to actions.
- **`branch`:** a condition on a state variable, and the steps it guards.

Handlers hold three kinds of actions:
- `evidence <facet> <word>`
- `set <variable> (=|+=|-=) <number>`
- a spoken line

## 5. Screenplay syntax

```text
---
lesson: harbor:compliance-call
world: ./world.json
language: en
learner_language: zh
state:
  trust.priya: 0
---

# scene call @harbor:office-night
! camera priya
PRIYA (stern): "Without that {disclosure}, the firm's {liability} is very different."
  zh: 没有那段披露……
> A regulator saw the posts. Your product is now under {scrutiny}.

? lessonml:pick-evidence case-1
  prompt: Tap the sentence Ledger could not {verify}.
  - Revenue rose 18%.
    hint: This comes from the filing.
  * An analyst report from Northfield Research calls it "a clean beat."
  on correct: evidence read verify; set trust.priya += 1
  on wrong: PRIYA (stern): "Look again."

if trust.priya > 0:
  PRIYA (smile): "Good. You check before you speak."
```

| Construct | Form |
|---|---|
| Scene | `# scene <id> @<place-id>` |
| Line | `NAME (expression): "text"`; the expression is optional |
| Narration | `> text` |
| Translation | an indented `<lang>: text` under a line |
| Target word | `{word}`, or `{surface\|lemma}` |
| Stage direction | `! <verb> <args…>` |
| Interaction | `? <component> <id>`; inside it, `key: value` props, `- wrong option`, `* correct option`, an indented `hint:` under an option, and `on <event>: action; action` or indented actions |
| Branch | `if <variable> <op> <number>:` followed by an indented block |
| Comment | `// …` |

Blocks are indented by two spaces.

## 6. Diagnostics

Each diagnostic is `line N [code]: message. Did you mean: a, b?`. The codes are stable so that tools and fine-tuning data can rely on them:

- `unknown-place`
- `unknown-speaker`
- `unknown-expression`
- `unknown-stage-verb`
- `unknown-stage-arg`
- `unknown-component`
- `missing-prop`
- `unknown-prop`
- `option-count`
- `correct-count`
- `missing-hint`
- `unknown-event`
- `unknown-facet`
- `facet-not-produced`
- `undeclared-state`
- `duplicate-id`
- `outside-scene`
- `unknown-line`

## 7. Resource packs

### 7.1 Style packs

A style pack (`src/rig/styles.ts`) sets the drawing rules:
- outline;
- shading mode;
- eye, face and nose types;
- brow weight, blush and hair shine;
- gradients;
- colour grading.

Three packs ship today: `anime-clean`, `flat-modern` and `ligne-claire`.

### 7.2 Character rig

A character is a few parameters: hair style, outfit, glasses, and four base colours. Every shade and every part is derived from them.

Runtimes rely on this part contract:
- the groups `.hb`, `.bd`, `.nk` and `.hf`, for breathing and head tilt;
- `.lock[data-pivot]`, for hair sway;
- `[data-part][data-v]` for swappable parts:
  - `eye`: `open`, `closed`;
  - `brow`: the five expressions;
  - `mouth`: the five expressions and `talk`.

`generateCharacter(seed)` makes a new character that is consistent under every pack.

## 8. Player (v0.2, v0.4)

`LessonSession` (`src/player/session.ts`) is the reference interpreter: a pure state machine over the IR, shared by every runtime. It owns order, state, branches, blocking, back navigation and evidence.

Stage semantics:
- `camera` and `screen` persist until they are changed.
- `effect <name>` applies to the next line or interaction only.
- Any other verb keeps its latest arguments. For example, `search <free text>` is allowed when the place declares `"*"` for that verb.
- `NAME (expression):` sets that character's expression until it is changed.
- An interaction blocks forward motion until it is solved. A wrong answer shows the option's hint and any line its `on wrong` handler says.

`<lml-scene>` (`src/player/element.ts`) is the web runtime:

```html
<script type="module" src="lessonml/dist/src/player/element.js"></script>
<lml-scene src="lesson.lml" world="world.json" style-pack="anime-clean"></lml-scene>
```

The element draws the place's set, fills the set's character slots (`place.cast`), and runs the camera, parallax, breathing, blinking and lip flaps.

The element has two modes, like `<video>`:
- **Standalone** (the default) brings its own navigation:
  - swipe up, wheel, ↓ or Space moves on;
  - ↑ goes back;
  - tapping a line finishes it or shows the translation;
  - a hint at the bottom says what to do next.
- **Embedded** (`controls="host"`): the host app drives the lesson with `next()` and `back()`, listens to `lml-frame` (`index`, `blocked`, `canGoBack`, `frame`), and draws its own navigation. See `playground/embed.html`.

The generic panels are option buttons, a cloze input, speech recognition with a typed fallback, and a text area for `write`. Set `element.reviewer` to judge writing.

### 8.1 Sets

The player draws nothing about any particular place. A **set** (`src/sets/types.ts`) supplies:
- its SVG, with one `[data-camera]` group that the camera moves;
- named shots;
- character slots;
- how a frame's stage looks (`stage`);
- optionally, interactions drawn inside the scene (`hosts` and `surface`), `settle` for previews, and `tick` for ambient motion.

Register a set with `registerSet()`. A place points to it with `"set": "<id>"` and fills its slots with `"cast": { "<slot>": "<character>" }`.

Two sets ship today:
- `harbor-office`: a night office with a monitor that can show a call, a shared page, logs or a search. It plays `pick-evidence` on the logs screen.
- `classroom`: a whiteboard (`! board <text>`, where ` | ` starts a new line) and one mentor slot.

The element emits these events:
- `lml-frame` (every frame)
- `lml-evidence`
- `lml-state`
- `lml-word` (with the target id, gloss and definition)
- `lml-end`
- `lml-error` (the compiler diagnostics, or a place without a set)

## 9. MCP server (v0.3)

`src/mcp/server.ts` exposes the authoring loop to any MCP client over stdio:

| Tool | What it gives the model |
|---|---|
| `lessonml_guide` | Syntax, components and craft rules. Read it first. |
| `lessonml_describe_world` | The world catalog, with every id spelled as it must be written, or a list of the available worlds |
| `lessonml_compile` | `ok`, or diagnostics to repair |
| `lessonml_simulate` | A transcript played without drawing: frames, attempts, hints, state, evidence, branches taken or skipped, and warnings. `answers` tries other paths. |
| `lessonml_render_preview` | PNG screenshots of chosen frames from headless Chrome, each with a description of the frame |

The loop is: guide → describe → write → compile until it passes → simulate → preview, then fix.

Simulate is cheap and catches structural problems. For example, it catches a character shot while the monitor shows something else, or an interaction that produces no evidence. Previews catch visual problems: hidden text, empty panels, wrong framing.

## 10. Roadmap

| Version | Scope |
|---|---|
| v0.1 | Syntax, IR, compiler and diagnostics, core components, character rig, three style packs |
| v0.2 | ✅ Interpreter (`LessonSession`) and `<lml-scene>` web component; place sets with character slots; camera and parallax |
| v0.3 | ✅ MCP server: guide, describe_world, compile, simulate, render_preview, so a model can write, check, play and see its work |
| v0.4 | ✅ Subject-neutral evidence (targets and facet packs); glossary; `write` with pluggable reviewers; pluggable sets; embedded mode; math acceptance lesson |
| v0.5 | ✅ Expression layer (formulas, live `{=…}` text, expression conditions); `numeric` with tolerance and units; `explore` sliders with goals; live charts in the classroom set |
| v0.5.x | Formula typesetting (KaTeX); more live props (geometry, motion); a physics acceptance lesson |
| v0.6 | Improvisation slots: lines a runtime model may improvise within a character card, state and lesson goal |
| later | Pack registry; npm release |
