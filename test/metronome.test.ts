import type Metronome from "@metronome/sdk"
import { describe, expect, it, vi } from "vitest"

import { MetronomeProvider } from "../src/providers/metronome.js"
import type { CanonicalRateAdd } from "../src/providers/types.js"

function asyncIterable<T>(items: T[]): AsyncIterable<T> {
    return {
        async *[Symbol.asyncIterator]() {
            for (const item of items) {
                yield item
            }
        }
    }
}

interface MockClient {
    retrieve: ReturnType<typeof vi.fn>
    listCards: ReturnType<typeof vi.fn>
    listProducts: ReturnType<typeof vi.fn>
    listRates: ReturnType<typeof vi.fn>
    addMany: ReturnType<typeof vi.fn>
}

function createClient(mocks: MockClient): Metronome {
    const client = {
        v1: {
            contracts: {
                rateCards: {
                    retrieve: mocks.retrieve,
                    list: mocks.listCards,
                    rates: {
                        list: mocks.listRates,
                        addMany: mocks.addMany
                    }
                },
                products: {
                    list: mocks.listProducts
                }
            }
        }
    }

    // Test boundary: the mock only implements the handful of SDK methods the provider uses.
    return client as unknown as Metronome
}

function baseMocks(): MockClient {
    return {
        retrieve: vi.fn(),
        listCards: vi.fn(() => asyncIterable([])),
        listProducts: vi.fn(() => asyncIterable([])),
        listRates: vi.fn(() => asyncIterable([])),
        addMany: vi.fn(async () => undefined)
    }
}

describe("MetronomeProvider.resolveRateCard", () => {
    it("retrieves by id when given a UUID", async () => {
        const id = "f3d51ae8-f283-44e1-9933-a3cf9ad7a6fe"
        const mocks = baseMocks()
        mocks.retrieve.mockResolvedValue({ data: { id, name: "Standard" } })
        const provider = new MetronomeProvider(createClient(mocks))

        const ref = await provider.resolveRateCard(id)

        expect(ref).toEqual({ id, name: "Standard" })
        expect(mocks.retrieve).toHaveBeenCalledWith({ id })
    })

    it("looks up by name when given a non-UUID", async () => {
        const mocks = baseMocks()
        mocks.listCards.mockReturnValue(asyncIterable([{ id: "rc-1", name: "Standard rate card" }]))
        const provider = new MetronomeProvider(createClient(mocks))

        const ref = await provider.resolveRateCard("Standard rate card")

        expect(ref).toEqual({ id: "rc-1", name: "Standard rate card" })
    })

    it("throws when a named rate card is not found", async () => {
        const mocks = baseMocks()
        mocks.listCards.mockReturnValue(asyncIterable([{ id: "rc-1", name: "Other" }]))
        const provider = new MetronomeProvider(createClient(mocks))

        await expect(provider.resolveRateCard("Missing")).rejects.toThrow(/Rate card not found/)
    })
})

describe("MetronomeProvider.listProducts", () => {
    it("builds name <-> id maps from product current state", async () => {
        const mocks = baseMocks()
        mocks.listProducts.mockReturnValue(asyncIterable([{ id: "prod-1", current: { name: "GPT-5 input tokens" } }]))
        const provider = new MetronomeProvider(createClient(mocks))

        const maps = await provider.listProducts()

        expect(maps.nameToId.get("GPT-5 input tokens")).toBe("prod-1")
        expect(maps.idToName.get("prod-1")).toBe("GPT-5 input tokens")
    })
})

describe("MetronomeProvider.getRates", () => {
    it("maps SDK rate entries into canonical rates", async () => {
        const mocks = baseMocks()
        mocks.listRates.mockReturnValue(
            asyncIterable([
                {
                    product_id: "prod-1",
                    product_name: "GPT-5 input tokens",
                    entitled: true,
                    pricing_group_values: { region: "us-west-2" },
                    billing_frequency: "MONTHLY",
                    commit_rate: { rate_type: "FLAT", price: 1200 },
                    rate: {
                        rate_type: "TIERED",
                        price: 0,
                        credit_type: { id: "ct-1", name: "USD" },
                        tiers: [{ size: 100, price: 10 }, { price: 5 }],
                        custom_rate: { processor: "x" },
                        quantity: 2,
                        is_prorated: true
                    }
                }
            ])
        )
        const provider = new MetronomeProvider(createClient(mocks))

        const rates = await provider.getRates("rc-1", "2026-06-19T00:00:00.000Z")

        expect(rates[0]).toEqual({
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
        })
    })

    it("handles minimal rate entries", async () => {
        const mocks = baseMocks()
        mocks.listRates.mockReturnValue(
            asyncIterable([
                {
                    product_id: "prod-2",
                    product_name: "Output tokens",
                    entitled: false,
                    rate: { rate_type: "FLAT" }
                }
            ])
        )
        const provider = new MetronomeProvider(createClient(mocks))

        const rates = await provider.getRates("rc-1", "2026-06-19T00:00:00.000Z")

        expect(rates[0]).toEqual({ productId: "prod-2", productName: "Output tokens", rateType: "FLAT", entitled: false })
    })
})

describe("MetronomeProvider.addRates", () => {
    it("returns early without calling the SDK for an empty list", async () => {
        const mocks = baseMocks()
        const provider = new MetronomeProvider(createClient(mocks))

        await provider.addRates("rc-1", [])

        expect(mocks.addMany).not.toHaveBeenCalled()
    })

    it("maps canonical rates into the addMany payload", async () => {
        const mocks = baseMocks()
        const provider = new MetronomeProvider(createClient(mocks))
        const rate: CanonicalRateAdd = {
            productId: "prod-1",
            rateType: "TIERED",
            entitled: true,
            startingAt: "2026-06-19T00:00:00.000Z",
            price: 0,
            creditTypeId: "ct-1",
            pricingGroupValues: { region: "us-west-2" },
            billingFrequency: "MONTHLY",
            tiers: [{ size: 100, price: 10 }, { price: 5 }],
            customRate: { processor: "x" },
            quantity: 2,
            isProrated: true,
            commitRate: { rateType: "TIERED", tiers: [{ size: 50, price: 8 }, { price: 4 }] }
        }

        await provider.addRates("rc-1", [rate])

        expect(mocks.addMany).toHaveBeenCalledTimes(1)
        expect(mocks.addMany.mock.calls[0]?.[0]).toEqual({
            rate_card_id: "rc-1",
            rates: [
                {
                    product_id: "prod-1",
                    rate_type: "TIERED",
                    entitled: true,
                    starting_at: "2026-06-19T00:00:00.000Z",
                    price: 0,
                    credit_type_id: "ct-1",
                    pricing_group_values: { region: "us-west-2" },
                    billing_frequency: "MONTHLY",
                    tiers: [{ size: 100, price: 10 }, { price: 5 }],
                    custom_rate: { processor: "x" },
                    quantity: 2,
                    is_prorated: true,
                    commit_rate: { rate_type: "TIERED", tiers: [{ size: 50, price: 8 }, { price: 4 }] }
                }
            ]
        })
    })
})
