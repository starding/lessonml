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

Evidence has five facets: `read`, `listen`, `speak`, `write` and `recall`. Each evidence event is `(facet, word or skill, outcome)`, and maps onto xAPI statements:

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

The core set is `lessonml:pick-evidence`, `lessonml:cloze`, `lessonml:choose-reply` and `lessonml:speak`. They started in language learning, but none of them is about language only.

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

## 8. Roadmap

| Version | Scope |
|---|---|
| v0.1 | Syntax, IR, compiler and diagnostics, core components, character rig, three style packs |
| v0.2 | Scene player as a web component (`<lml-scene>`); place sets; camera and parallax |
| v0.3 | MCP server with `describe_world`, `compile` and `render_preview` (a screenshot), so a model can write, check and see its work |
| v0.4 | Improvisation slots: lines a runtime model may improvise within a character card, state and lesson goal |
| v0.5 | Pack registry; the first non-language components (simulation sliders, charts) |
