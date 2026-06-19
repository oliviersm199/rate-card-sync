import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CanonicalRate, CanonicalRateAdd, ProductMaps, RateCardProvider, RateCardRef } from "../src/providers/types.js"
import { resolveSyncExitCode, sync } from "../src/sync.js"

const products: ProductMaps = {
    nameToId: new Map([["GPT-5 input tokens", "prod-1"]]),
    idToName: new Map([["prod-1", "GPT-5 input tokens"]])
}

function flatRate(price: number): CanonicalRate {
    return { productId: "prod-1", productName: "GPT-5 input tokens", rateType: "FLAT", entitled: true, price }
}

let currentRates: CanonicalRate[] = []

function createMockProvider(): RateCardProvider & { addRates: ReturnType<typeof vi.fn> } {
    return {
        name: "metronome",
        resolveRateCard: vi.fn(async (): Promise<RateCardRef> => ({ id: "rc-1", name: "Standard rate card" })),
        listProducts: vi.fn(async () => products),
        getRates: vi.fn(async () => currentRates),
        addRates: vi.fn(async (_rateCardId: string, _rates: CanonicalRateAdd[]) => undefined)
    }
}

vi.mock("../src/providers/index.js", () => ({
    getProvider: () => mockProvider
}))

let mockProvider = createMockProvider()

async function writeSpec(body: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "rate-card-sync-"))
    const specPath = join(dir, "rate-card.yaml")
    await writeFile(specPath, body, "utf8")
    return specPath
}

beforeEach(() => {
    currentRates = [flatRate(500)]
    mockProvider = createMockProvider()
})

afterEach(() => {
    vi.restoreAllMocks()
})

const changedSpec = `provider: metronome
rateCard:
  name: Standard rate card
rates:
  - product: GPT-5 input tokens
    rateType: FLAT
    price: 600
    entitled: true
    startingAt: "2026-06-19T00:00:00.000Z"
`

const unchangedSpec = `provider: metronome
rateCard:
  name: Standard rate card
rates:
  - product: GPT-5 input tokens
    rateType: FLAT
    price: 500
    entitled: true
`

describe("sync", () => {
    it("does not call addRates during dry run", async () => {
        const specPath = await writeSpec(changedSpec)
        const result = await sync({ specPath, dryRun: true })

        expect(mockProvider.addRates).not.toHaveBeenCalled()
        expect(result.hasPendingChanges).toBe(true)
        expect(resolveSyncExitCode(result, true, true)).toBe(2)
    })

    it("calls addRates when applying changes", async () => {
        const specPath = await writeSpec(changedSpec)
        await sync({ specPath, dryRun: false })

        expect(mockProvider.addRates).toHaveBeenCalledTimes(1)
        expect(mockProvider.addRates.mock.calls[0]?.[1]).toEqual([expect.objectContaining({ productId: "prod-1", price: 600, startingAt: "2026-06-19T00:00:00.000Z" })])
    })

    it("reports no changes when spec matches current state (dry run)", async () => {
        const specPath = await writeSpec(unchangedSpec)
        const result = await sync({ specPath, dryRun: true })

        expect(result.hasPendingChanges).toBe(false)
        expect(mockProvider.addRates).not.toHaveBeenCalled()
        expect(resolveSyncExitCode(result, true, true)).toBe(0)
    })

    it("does not apply when there are no changes", async () => {
        const specPath = await writeSpec(unchangedSpec)
        const result = await sync({ specPath, dryRun: false })

        expect(result.hasPendingChanges).toBe(false)
        expect(mockProvider.addRates).not.toHaveBeenCalled()
    })

    it("plans additions and extra rates", async () => {
        currentRates = [flatRate(500), { productId: "prod-1", productName: "GPT-5 input tokens", rateType: "FLAT", entitled: true, price: 999, pricingGroupValues: { region: "eu" } }]

        const specPath = await writeSpec(`provider: metronome
rateCard:
  name: Standard rate card
rates:
  - product: GPT-5 input tokens
    rateType: FLAT
    price: 500
    entitled: true
  - product: GPT-5 input tokens
    rateType: FLAT
    price: 1500
    entitled: true
    pricingGroupValues:
      region: us-west-2
`)

        const result = await sync({ specPath, dryRun: true })

        expect(result.hasPendingChanges).toBe(true)
    })

    it("resolves a rate card by id when name is absent", async () => {
        const specPath = await writeSpec(`provider: metronome
rateCard:
  id: 11111111-1111-1111-1111-111111111111
rates:
  - product: GPT-5 input tokens
    rateType: FLAT
    price: 500
    entitled: true
`)

        await sync({ specPath, dryRun: true })

        expect(mockProvider.resolveRateCard).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111")
    })
})

describe("resolveSyncExitCode", () => {
    it("returns 0 when exit-code flag is disabled", () => {
        expect(resolveSyncExitCode({ hasPendingChanges: true }, false, true)).toBe(0)
    })

    it("returns 2 only for pending changes in dry-run", () => {
        expect(resolveSyncExitCode({ hasPendingChanges: true }, true, true)).toBe(2)
        expect(resolveSyncExitCode({ hasPendingChanges: true }, true, false)).toBe(0)
        expect(resolveSyncExitCode({ hasPendingChanges: false }, true, true)).toBe(0)
    })
})
