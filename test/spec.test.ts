import { describe, expect, it } from "vitest"

import { dumpSpec, loadSpec } from "../src/spec.js"

const validSpec = `
provider: metronome
rateCard:
  name: Standard rate card
rates:
  - product: GPT-5 input tokens
    rateType: FLAT
    price: 500
    entitled: true
`

describe("spec", () => {
    it("loads a valid spec", () => {
        const spec = loadSpec(validSpec)

        expect(spec.provider).toBe("metronome")
        expect(spec.rateCard.name).toBe("Standard rate card")
        expect(spec.rates).toHaveLength(1)
        expect(spec.rates[0]?.price).toBe(500)
    })

    it("rejects invalid specs", () => {
        expect(() => loadSpec("rates: []")).toThrow(/Invalid spec/)
    })

    it("round-trips through YAML", () => {
        const spec = loadSpec(validSpec)
        const roundTripped = loadSpec(dumpSpec(spec))

        expect(roundTripped).toEqual(spec)
    })

    it("loads a commit rate and round-trips it", () => {
        const source = `provider: metronome
rateCard:
  name: Standard rate card
rates:
  - product: LLM Output Tokens
    rateType: FLAT
    price: 0
    entitled: true
    commitRate:
      rateType: FLAT
      price: 1200
`
        const spec = loadSpec(source)

        expect(spec.rates[0]?.commitRate).toEqual({ rateType: "FLAT", price: 1200 })
        expect(loadSpec(dumpSpec(spec))).toEqual(spec)
    })
})
