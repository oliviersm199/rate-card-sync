import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { getProvider } from "../src/providers/index.js"

let originalToken: string | undefined

beforeAll(() => {
    originalToken = process.env.METRONOME_BEARER_TOKEN
    process.env.METRONOME_BEARER_TOKEN = "test-token"
})

afterAll(() => {
    if (originalToken === undefined) {
        delete process.env.METRONOME_BEARER_TOKEN
    } else {
        process.env.METRONOME_BEARER_TOKEN = originalToken
    }
})

describe("getProvider", () => {
    it("defaults to the metronome provider", () => {
        expect(getProvider().name).toBe("metronome")
    })

    it("returns the metronome provider by name", () => {
        expect(getProvider("metronome").name).toBe("metronome")
    })

    it("throws a clear error for an unknown provider", () => {
        expect(() => getProvider("stripe")).toThrow(/Unknown provider "stripe".*metronome/)
    })
})
