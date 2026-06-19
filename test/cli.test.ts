import { APIError } from "@metronome/sdk"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatError, isMainModule, run } from "../src/cli.js"

const extractMock = vi.fn(async () => "provider: metronome\n")
const syncMock = vi.fn(async () => ({ hasPendingChanges: true }))
const resolveExitMock = vi.fn(() => 2)

vi.mock("../src/extract.js", () => ({
    extract: (...args: unknown[]) => extractMock(...args)
}))

vi.mock("../src/sync.js", () => ({
    sync: (...args: unknown[]) => syncMock(...args),
    resolveSyncExitCode: (...args: unknown[]) => resolveExitMock(...args)
}))

let originalExitCode: typeof process.exitCode

beforeEach(() => {
    originalExitCode = process.exitCode
    process.exitCode = undefined
    extractMock.mockClear()
    syncMock.mockClear()
    resolveExitMock.mockClear()
})

afterEach(() => {
    process.exitCode = originalExitCode
    vi.restoreAllMocks()
})

describe("cli extract", () => {
    it("writes YAML to stdout when --out is omitted", async () => {
        const write = vi.spyOn(process.stdout, "write").mockReturnValue(true)

        await run(["node", "rate-card", "extract", "--rate-card", "Standard"])

        expect(extractMock).toHaveBeenCalledWith({ rateCard: "Standard", providerName: "metronome", out: undefined })
        expect(write).toHaveBeenCalledWith("provider: metronome\n")
    })

    it("does not write to stdout when --out is provided", async () => {
        const write = vi.spyOn(process.stdout, "write").mockReturnValue(true)

        await run(["node", "rate-card", "extract", "--rate-card", "Standard", "--out", "out.yaml"])

        expect(extractMock).toHaveBeenCalledWith({ rateCard: "Standard", providerName: "metronome", out: "out.yaml" })
        expect(write).not.toHaveBeenCalled()
    })
})

describe("cli sync", () => {
    it("sets the exit code from resolveSyncExitCode", async () => {
        await run(["node", "rate-card", "sync", "spec.yaml", "--dry-run", "--exit-code"])

        expect(syncMock).toHaveBeenCalledWith({ specPath: "spec.yaml", dryRun: true, exitCode: true })
        expect(resolveExitMock).toHaveBeenCalledWith({ hasPendingChanges: true }, true, true)
        expect(process.exitCode).toBe(2)
    })
})

describe("cli error handling", () => {
    it("prints the message and sets exit code 1 on failure", async () => {
        syncMock.mockRejectedValueOnce(new Error("boom"))
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

        await run(["node", "rate-card", "sync", "spec.yaml"])

        expect(error).toHaveBeenCalledWith("boom")
        expect(process.exitCode).toBe(1)
    })
})

describe("formatError", () => {
    it("surfaces status, request id, and response body for API errors", () => {
        const headers = new Headers({ "x-request-id": "req-123" })
        const apiError = new APIError(400, { message: "Unknown error parsing request body" }, undefined, headers)

        const formatted = formatError(apiError)

        expect(formatted).toContain("HTTP 400")
        expect(formatted).toContain("Request ID: req-123")
        expect(formatted).toContain("Unknown error parsing request body")
    })

    it("falls back to the message for plain errors", () => {
        expect(formatError(new Error("plain"))).toBe("plain")
    })

    it("stringifies non-error values", () => {
        expect(formatError("oops")).toBe("oops")
    })
})

describe("isMainModule", () => {
    it("returns false when there is no entry path", () => {
        expect(isMainModule(undefined, import.meta.url)).toBe(false)
    })

    it("returns false when the entry cannot be resolved", () => {
        expect(isMainModule("/nope/this-path-does-not-exist", import.meta.url)).toBe(false)
    })

    it("returns true when the entry resolves to the module file", () => {
        expect(isMainModule(fileURLToPath(import.meta.url), import.meta.url)).toBe(true)
    })

    it("returns false when the entry is a different real file", () => {
        expect(isMainModule(process.execPath, import.meta.url)).toBe(false)
    })
})
