import { dequal } from "dequal"
import { z } from "zod"

import type { CanonicalCommitRate, CanonicalRate, CanonicalRateAdd, RateCardProvider, ResourceContext, Tier } from "../providers/types.js"

import type { ResourceChanges, ResourceModule } from "./types.js"

const rateTypeSchema = z.enum(["FLAT", "PERCENTAGE", "SUBSCRIPTION", "TIERED", "TIERED_PERCENTAGE", "CUSTOM"])

const billingFrequencySchema = z.enum(["MONTHLY", "QUARTERLY", "ANNUAL", "WEEKLY"])

const tierSchema = z.object({
    size: z.number().optional(),
    price: z.number()
})

const commitRateSchema = z.object({
    rateType: rateTypeSchema,
    price: z.number().optional(),
    tiers: z.array(tierSchema).optional()
})

export const rateSpecSchema = z.object({
    product: z.string().min(1),
    rateType: rateTypeSchema,
    entitled: z.boolean(),
    price: z.number().optional(),
    creditTypeId: z.string().uuid().optional(),
    startingAt: z.string().optional(),
    pricingGroupValues: z.record(z.string()).optional(),
    billingFrequency: billingFrequencySchema.optional(),
    tiers: z.array(tierSchema).optional(),
    customRate: z.record(z.unknown()).optional(),
    quantity: z.number().optional(),
    isProrated: z.boolean().optional(),
    commitRate: commitRateSchema.optional()
})

export type RateSpec = z.infer<typeof rateSpecSchema>

export const ratesSchema = z.array(rateSpecSchema)

function stableKey(values: Record<string, string> | undefined): string {
    if (!values || Object.keys(values).length === 0) {
        return ""
    }

    return JSON.stringify(Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))))
}

function identityFields(item: RateSpec): Omit<RateSpec, "startingAt"> {
    const { startingAt: _startingAt, ...fields } = item
    return fields
}

function toCanonicalTiers(tiers: ReadonlyArray<{ size?: number | undefined; price: number }>): Tier[] {
    return tiers.map(tier => {
        const mapped: Tier = { price: tier.price }
        if (tier.size !== undefined) {
            mapped.size = tier.size
        }
        return mapped
    })
}

function toCanonicalCommitRate(commitRate: NonNullable<RateSpec["commitRate"]>): CanonicalCommitRate {
    const mapped: CanonicalCommitRate = { rateType: commitRate.rateType }

    if (commitRate.price !== undefined) {
        mapped.price = commitRate.price
    }

    if (commitRate.tiers) {
        mapped.tiers = toCanonicalTiers(commitRate.tiers)
    }

    return mapped
}

function canonicalToSpec(rate: CanonicalRate, ctx: ResourceContext): RateSpec {
    const product = ctx.products.idToName.get(rate.productId) ?? rate.productName

    const spec: RateSpec = {
        product,
        rateType: rate.rateType,
        entitled: rate.entitled
    }

    if (rate.price !== undefined) {
        spec.price = rate.price
    }

    if (rate.creditTypeId) {
        spec.creditTypeId = rate.creditTypeId
    }

    if (rate.pricingGroupValues) {
        spec.pricingGroupValues = rate.pricingGroupValues
    }

    if (rate.billingFrequency) {
        spec.billingFrequency = rate.billingFrequency
    }

    if (rate.tiers) {
        spec.tiers = rate.tiers
    }

    if (rate.customRate) {
        spec.customRate = rate.customRate
    }

    if (rate.quantity !== undefined) {
        spec.quantity = rate.quantity
    }

    if (rate.isProrated !== undefined) {
        spec.isProrated = rate.isProrated
    }

    if (rate.commitRate) {
        spec.commitRate = rate.commitRate
    }

    return spec
}

function resolveProductId(spec: RateSpec, ctx: ResourceContext): string {
    const productId = ctx.products.nameToId.get(spec.product)

    if (!productId) {
        throw new Error(`Product not found: ${spec.product}`)
    }

    return productId
}

function specToCanonicalAdd(spec: RateSpec, ctx: ResourceContext, startingAt: string): CanonicalRateAdd {
    const add: CanonicalRateAdd = {
        productId: resolveProductId(spec, ctx),
        rateType: spec.rateType,
        entitled: spec.entitled,
        startingAt
    }

    if (spec.price !== undefined) {
        add.price = spec.price
    }

    if (spec.creditTypeId) {
        add.creditTypeId = spec.creditTypeId
    }

    if (spec.pricingGroupValues) {
        add.pricingGroupValues = spec.pricingGroupValues
    }

    if (spec.billingFrequency) {
        add.billingFrequency = spec.billingFrequency
    }

    if (spec.tiers) {
        add.tiers = toCanonicalTiers(spec.tiers)
    }

    if (spec.customRate) {
        add.customRate = spec.customRate
    }

    if (spec.quantity !== undefined) {
        add.quantity = spec.quantity
    }

    if (spec.isProrated !== undefined) {
        add.isProrated = spec.isProrated
    }

    if (spec.commitRate) {
        add.commitRate = toCanonicalCommitRate(spec.commitRate)
    }

    return add
}

function defaultStartingAt(): string {
    const date = new Date()
    date.setUTCMinutes(0, 0, 0)
    date.setUTCHours(date.getUTCHours() + 1)
    return date.toISOString()
}

export const ratesModule: ResourceModule<RateSpec> = {
    key: "rates",
    schema: ratesSchema,

    async list(provider, ctx) {
        const at = new Date().toISOString()
        const canonical = await provider.getRates(ctx.rateCardId, at)
        return canonical.map(rate => canonicalToSpec(rate, ctx))
    },

    identity(item) {
        return `${item.product}::${stableKey(item.pricingGroupValues)}::${item.billingFrequency ?? ""}`
    },

    equals(a, b) {
        return dequal(identityFields(a), identityFields(b))
    },

    async apply(provider, ctx, changes) {
        const toApply: CanonicalRateAdd[] = []

        for (const item of changes.toAdd) {
            const startingAt = item.startingAt ?? defaultStartingAt()
            toApply.push(specToCanonicalAdd(item, ctx, startingAt))
        }

        for (const change of changes.changed) {
            const startingAt = change.desired.startingAt ?? defaultStartingAt()
            toApply.push(specToCanonicalAdd(change.desired, ctx, startingAt))
        }

        await provider.addRates(ctx.rateCardId, toApply)
    }
}
