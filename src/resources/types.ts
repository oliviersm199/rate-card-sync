import type { z } from "zod"

import type { RateCardProvider, ResourceContext } from "../providers/types.js"

export interface ResourceChanges<Item> {
    toAdd: Item[]
    changed: Array<{ current: Item; desired: Item }>
    extra: Item[]
}

export interface ResourceModule<Item> {
    key: string
    schema: z.ZodType<Item[]>
    list(provider: RateCardProvider, ctx: ResourceContext): Promise<Item[]>
    identity(item: Item): string
    equals(a: Item, b: Item): boolean
    apply(provider: RateCardProvider, ctx: ResourceContext, changes: ResourceChanges<Item>): Promise<void>
}
