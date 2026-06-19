import { describe, expect, it } from "vitest"

import { diff, hasChanges } from "../src/diff.js"
import type { RateSpec } from "../src/resources/rates.js"
import { ratesModule } from "../src/resources/rates.js"

const baseRate: RateSpec = {
    product: "GPT-5 input tokens",
    rateType: "FLAT",
    entitled: true,
    price: 500
}

describe("diff", () => {
    it("detects additions", () => {
        const result = diff([], [baseRate], {
            identity: ratesModule.identity,
            equals: ratesModule.equals
        })

        expect(result.toAdd).toHaveLength(1)
        expect(result.changed).toHaveLength(0)
        expect(result.unchanged).toHaveLength(0)
        expect(result.extra).toHaveLength(0)
        expect(hasChanges(result)).toBe(true)
    })

    it("detects unchanged rates", () => {
        const result = diff([baseRate], [baseRate], {
            identity: ratesModule.identity,
            equals: ratesModule.equals
        })

        expect(result.toAdd).toHaveLength(0)
        expect(result.changed).toHaveLength(0)
        expect(result.unchanged).toHaveLength(1)
        expect(result.extra).toHaveLength(0)
        expect(hasChanges(result)).toBe(false)
    })

    it("detects price changes", () => {
        const updated = { ...baseRate, price: 600 }
        const result = diff([baseRate], [updated], {
            identity: ratesModule.identity,
            equals: ratesModule.equals
        })

        expect(result.changed).toHaveLength(1)
        expect(result.changed[0]?.desired.price).toBe(600)
        expect(hasChanges(result)).toBe(true)
    })

    it("treats pricing group values as identity", () => {
        const west = { ...baseRate, pricingGroupValues: { region: "us-west-2" } }
        const east = { ...baseRate, pricingGroupValues: { region: "us-east-2" } }

        const result = diff([west], [east], {
            identity: ratesModule.identity,
            equals: ratesModule.equals
        })

        expect(result.toAdd).toHaveLength(1)
        expect(result.extra).toHaveLength(1)
    })

    it("compares tiers with dequal", () => {
        const tieredA: RateSpec = {
            ...baseRate,
            rateType: "TIERED",
            tiers: [{ size: 100, price: 10 }, { price: 5 }]
        }
        const tieredB: RateSpec = {
            ...tieredA,
            tiers: [{ size: 100, price: 10 }, { price: 6 }]
        }

        const result = diff([tieredA], [tieredB], {
            identity: ratesModule.identity,
            equals: ratesModule.equals
        })

        expect(result.changed).toHaveLength(1)
    })

    it("detects commit rate changes", () => {
        const current: RateSpec = { ...baseRate, price: 0, commitRate: { rateType: "FLAT", price: 1200 } }
        const desired: RateSpec = { ...baseRate, price: 0, commitRate: { rateType: "FLAT", price: 1500 } }

        const result = diff([current], [desired], {
            identity: ratesModule.identity,
            equals: ratesModule.equals
        })

        expect(result.changed).toHaveLength(1)
    })

    it("detects extra rates not in desired state", () => {
        const result = diff([baseRate], [], {
            identity: ratesModule.identity,
            equals: ratesModule.equals
        })

        expect(result.extra).toHaveLength(1)
        expect(hasChanges(result)).toBe(false)
    })
})
