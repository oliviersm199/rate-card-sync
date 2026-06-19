import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { extract } from "../src/extract.js"
import type { CanonicalRate, ProductMaps, RateCardProvider, RateCardRef } from "../src/providers/types.js"

const products: ProductMaps = {
    nameToId: new Map([["GPT-5 input tokens", "prod-1"]]),
    idToName: new Map([["prod-1", "GPT-5 input tokens"]])
}

const currentRates: CanonicalRate[] = [{ productId: "prod-1", productName: "GPT-5 input tokens", rateType: "FLAT", entitled: true, price: 500 }]

let mockProvider: RateCardProvider = createMockProvider()

function createMockProvider(): RateCardProvider {
    return {
        name: "metronome",
        resolveRateCard: vi.fn(async (): Promise<RateCardRef> => ({ id: "rc-1", name: "Standard rate card" })),
        listProducts: vi.fn(async () => products),
        getRates: vi.fn(async () => currentRates),
        addRates: vi.fn(async () => undefined)
    }
}

vi.mock("../src/providers/index.js", () => ({
    getProvider: () => mockProvider
}))

afterEach(() => {
    mockProvider = createMockProvider()
})

describe("extract", () => {
    it("returns YAML containing the resolved rate card and rates", async () => {
        const yaml = await extract({ rateCard: "Standard rate card" })

        expect(yaml).toContain("provider: metronome")
        expect(yaml).toContain("name: Standard rate card")
        expect(yaml).toContain("GPT-5 input tokens")
        expect(yaml).toContain("price: 500")
    })

    it("writes the YAML to a file when --out is provided", async () => {
        const dir = await mkdtemp(join(tmpdir(), "rate-card-extract-"))
        const out = join(dir, "rate-card.yaml")

        const yaml = await extract({ rateCard: "Standard rate card", out })

        const written = await readFile(out, "utf8")
        expect(written).toBe(yaml)
    })
})
