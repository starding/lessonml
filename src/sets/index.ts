// Built-in sets. Register your own with registerSet() before the player loads a lesson.
import { registerSet } from './types.js'
import { HARBOR_OFFICE_SET } from './harbor-office.js'
import { CLASSROOM_SET } from './classroom.js'

registerSet(HARBOR_OFFICE_SET)
registerSet(CLASSROOM_SET)

export { registerSet, getSet, registeredSets, type SetDefinition, type SetContext, type SetRuntime, type Rect } from './types.js'
export { HARBOR_OFFICE_SET, CLASSROOM_SET }
