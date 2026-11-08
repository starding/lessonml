// Place sets (SPEC.md §7.3): the drawing that plays a place.
//
// The player is generic: camera, characters, dialogue, interaction panels.
// A set supplies the art, the camera shots, and how a frame's stage looks
// (which screen is up, which props are on). Anyone can register a set; a
// world points a place at one with "set": "<id>".

import type { World, PlaceEntry } from '../catalog.js'
import type { CharacterSpec } from '../rig/rig.js'
import type { StylePack } from '../rig/styles.js'
import type { Frame } from '../player/session.js'

export interface Rect { x: number; y: number; w: number; h: number }

export interface CastMember { spec?: CharacterSpec; name: string }

export interface SetContext {
  world: World
  place: PlaceEntry
  style: StylePack
  // The character sitting in one of the set's slots (place.cast).
  cast: (slot: string) => CastMember | undefined
}

// What the player lends a set while it runs.
export interface SetRuntime {
  q: (selector: string) => SVGElement | null
  qa: (selector: string) => SVGElement[]
  later: (fn: () => void, ms: number) => void
  shake: (amount: number) => void
  scan: () => void
  // Per-player scratch state (a set definition is shared by every player).
  memo: Record<string, unknown>
}

export interface SetDefinition {
  id: string
  // Character slots the set draws, e.g. ["call", "tile"].
  slots: string[]
  shots: Record<string, Rect>
  // The first shot, before the lesson directs the camera; and the shot when it never does.
  establishing: string
  defaultShot: string
  // SVG markup. It must contain one element with [data-camera]: the group the camera moves.
  build: (ctx: SetContext) => string
  // Apply a frame's stage to the drawing.
  stage?: (frame: Frame, rt: SetRuntime) => void
  // Interactions the set plays inside the scene instead of the generic panel.
  hosts?: (frame: Frame) => boolean
  surface?: (frame: Frame, rt: SetRuntime) => void
  // Finish any in-flight motion (previews).
  settle?: (rt: SetRuntime) => void
  // Per animation frame (weather, ambient motion).
  tick?: (rt: SetRuntime, dt: number, t: number) => void
}

const registry = new Map<string, SetDefinition>()

export const registerSet = (definition: SetDefinition) => { registry.set(definition.id, definition) }
export const getSet = (id: string | undefined) => (id ? registry.get(id) : undefined)
export const registeredSets = () => [...registry.keys()]
