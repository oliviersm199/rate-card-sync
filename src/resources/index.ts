import { ratesModule } from "./rates.js"
import type { ResourceModule } from "./types.js"

export const resourceModules = [ratesModule] as const satisfies readonly ResourceModule<unknown>[]

export function getResourceModules(): ResourceModule<unknown>[] {
    return [...resourceModules]
}

export { ratesModule, rateSpecSchema, ratesSchema } from "./rates.js"
export type { RateSpec } from "./rates.js"
