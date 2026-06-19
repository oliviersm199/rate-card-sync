import { describe, expect, it, vi } from "vitest"

import type { CanonicalRate, CanonicalRateAdd, RateCardProvider, RateCardRef, ResourceContext } from "../src/providers/types.js"
import type { RateSpec } from "../src/resources/rates.js"
import { ratesModule } from "../src/resources/rates.js"

function createContext(): ResourceContext {
    return {
        rateCardId: "rc-1",
        rateCardName: "Standard rate card",
        products: {
            nameToId: new Map([["GPT-5 input tokens", "prod-1"]]),
            idToName: new Map([["prod-1", "GPT-5 input tokens"]])
        }
    }
}

function createProvider(overrides: Partial<RateCardProvider> = {}): RateCardProvider & { addRates: ReturnType<typeof vi.fn> } {
    const addRates = vi.fn(async (_rateCardId: string, _rates: CanonicalRateAdd[]) => undefined)

    return {
        name: "metronome",
        resolveRateCard: vi.fn(async (): Promise<RateCardRef> => ({ id: "rc-1", name: "Standard rate card" })),
        listProducts: vi.fn(async () => createContext().products),
        getRates: vi.fn(async () => []),
        addRates,
        ...overrides
    }
}

describe("ratesModule.list", () => {
    it("maps every optional canonical field into the spec", async () => {
        const canonical: CanonicalRate = {
            productId: "prod-1",
            productName: "GPT-5 input tokens",
            rateType: "TIERED",
            entitled: true,
            price: 0,
            creditTypeId: "ct-1",
            pricingGroupValues: { region: "us-west-2" },
            billingFrequency: "MONTHLY",
            tiers: [{ size: 100, price: 10 }, { price: 5 }],
            customRate: { processor: "x" },
            quantity: 2,
            isProrated: true,
            commitRate: { rateType: "FLAT", price: 1200 }
        }

        const provider = createProvider({ getRates: vi.fn(async () => [canonical]) })
        const items = await ratesModule.list(provider, createContext())

        expect(items).toHaveLength(1)
        expect(items[0]).toEqual({
            product: "GPT-5 input tokens",
            rateType: "TIERED",
            entitled: true,
            price: 0,
            creditTypeId: "ct-1",
            pricingGroupValues: { region: "us-west-2" },
            billingFrequency: "MONTHLY",
            tiers: [{ size: 100, price: 10 }, { price: 5 }],
            customRate: { processor: "x" },
            quantity: 2,
            isProrated: true,
            commitRate: { rateType: "FLAT", price: 1200 }
        })
    })

    it("falls back to the canonical product name when id is not mapped", async () => {
        const canonical: CanonicalRate = {
            productId: "prod-unknown",
            productName: "Legacy product",
            rateType: "FLAT",
            entitled: true,
            price: 100
        }

        const provider = createProvider({ getRates: vi.fn(async () => [canonical]) })
        const items = await ratesModule.list(provider, createContext())

        expect(items[0]?.product).toBe("Legacy product")
    })
})

describe("ratesModule.identity", () => {
    const base: RateSpec = { product: "GPT-5 input tokens", rateType: "FLAT", entitled: true, price: 500 }

    it("ignores empty pricing group values and missing billing frequency", () => {
        expect(ratesModule.identity(base)).toBe("GPT-5 input tokens::::")
        expect(ratesModule.identity({ ...base, pricingGroupValues: {} })).toBe("GPT-5 input tokens::::")
    })

    it("sorts pricing group values deterministically", () => {
        const a = ratesModule.identity({ ...base, pricingGroupValues: { b: "2", a: "1" }, billingFrequency: "MONTHLY" })
        const b = ratesModule.identity({ ...base, pricingGroupValues: { a: "1", b: "2" }, billingFrequency: "MONTHLY" })

        expect(a).toBe(b)
        expect(a).toContain("MONTHLY")
    })
})

describe("ratesModule.equals", () => {
    const base: RateSpec = { product: "GPT-5 input tokens", rateType: "FLAT", entitled: true, price: 500 }

    it("ignores startingAt when comparing", () => {
        expect(ratesModule.equals(base, { ...base, startingAt: "2026-01-01T00:00:00.000Z" })).toBe(true)
    })

    it("detects field differences", () => {
        expect(ratesModule.equals(base, { ...base, price: 600 })).toBe(false)
    })
})

describe("ratesModule.apply", () => {
    it("uses explicit startingAt and maps tiers for additions and changes", async () => {
        const provider = createProvider()
        const added: RateSpec = {
            product: "GPT-5 input tokens",
            rateType: "TIERED",
            entitled: true,
            startingAt: "2026-06-19T00:00:00.000Z",
            creditTypeId: "ct-1",
            pricingGroupValues: { region: "us-west-2" },
            billingFrequency: "MONTHLY",
            tiers: [{ size: 100, price: 10 }, { price: 5 }],
            customRate: { processor: "x" },
            quantity: 3,
            isProrated: true,
            commitRate: { rateType: "TIERED", tiers: [{ size: 50, price: 8 }, { price: 4 }] }
        }
        const changed: RateSpec = { product: "GPT-5 input tokens", rateType: "FLAT", entitled: true, price: 600, startingAt: "2026-06-20T00:00:00.000Z" }

        await ratesModule.apply(provider, createContext(), {
            toAdd: [added],
            changed: [{ current: changed, desired: changed }],
            extra: []
        })

        expect(provider.addRates).toHaveBeenCalledTimes(1)
        const [, rates] = provider.addRates.mock.calls[0] ?? []
        expect(rates).toHaveLength(2)
        expect(rates?.[0]).toMatchObject({
            productId: "prod-1",
            startingAt: "2026-06-19T00:00:00.000Z",
            tiers: [{ size: 100, price: 10 }, { price: 5 }],
            creditTypeId: "ct-1",
            quantity: 3,
            isProrated: true,
            commitRate: { rateType: "TIERED", tiers: [{ size: 50, price: 8 }, { price: 4 }] }
        })
        expect(rates?.[1]).toMatchObject({ productId: "prod-1", price: 600, startingAt: "2026-06-20T00:00:00.000Z" })
    })

    it("defaults startingAt to a future hour boundary when omitted", async () => {
        const provider = createProvider()
        const added: RateSpec = { product: "GPT-5 input tokens", rateType: "FLAT", entitled: true, price: 700 }

        await ratesModule.apply(provider, createContext(), { toAdd: [added], changed: [], extra: [] })

        const [, rates] = provider.addRates.mock.calls[0] ?? []
        const startingAt = rates?.[0]?.startingAt ?? ""
        expect(startingAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/)
        expect(new Date(startingAt).getTime()).toBeGreaterThan(Date.now())
    })

    it("throws when a product name cannot be resolved", async () => {
        const provider = createProvider()
        const added: RateSpec = { product: "Unknown product", rateType: "FLAT", entitled: true, price: 100 }

        await expect(ratesModule.apply(provider, createContext(), { toAdd: [added], changed: [], extra: [] })).rejects.toThrow(/Product not found/)
    })
})
