#!/usr/bin/env node
import { APIError } from "@metronome/sdk"
import { Command } from "commander"
import { realpathSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

import { extract } from "./extract.js"
import { resolveSyncExitCode, sync } from "./sync.js"

const { version } = createRequire(import.meta.url)("../package.json") as { version: string }

export function formatError(error: unknown): string {
    if (error instanceof APIError) {
        const lines = [`Provider API error (HTTP ${error.status ?? "unknown"})`]

        const requestId = error.headers?.get("x-request-id")
        if (requestId) {
            lines.push(`Request ID: ${requestId}`)
        }

        if (error.error !== undefined) {
            lines.push(`Response body: ${JSON.stringify(error.error)}`)
        } else if (error.message) {
            lines.push(error.message)
        }

        return lines.join("\n")
    }

    return error instanceof Error ? error.message : String(error)
}

export function buildProgram(): Command {
    const program = new Command()

    program.name("rate-card").description("Extract and sync billing rate card pricing as YAML").version(version)

    program
        .command("extract")
        .description("Extract a rate card from a provider into YAML")
        .requiredOption("--rate-card <nameOrId>", "Rate card name or UUID")
        .option("--provider <name>", "Billing provider", "metronome")
        .option("--out <file>", "Write YAML to file instead of stdout")
        .action(async options => {
            const yaml = await extract({
                rateCard: options.rateCard,
                providerName: options.provider,
                out: options.out
            })

            if (!options.out) {
                process.stdout.write(yaml)
            }
        })

    program
        .command("sync")
        .description("Sync a YAML spec to the provider")
        .argument("<spec>", "Path to the YAML spec file")
        .option("--dry-run", "Preview changes without applying them", false)
        .option("--exit-code", "Exit 2 when changes are pending (for CI)", false)
        .action(async (specPath: string, options: { dryRun: boolean; exitCode: boolean }) => {
            const result = await sync({
                specPath,
                dryRun: options.dryRun,
                exitCode: options.exitCode
            })

            process.exitCode = resolveSyncExitCode(result, options.exitCode, options.dryRun)
        })

    return program
}

export async function run(argv: string[]): Promise<void> {
    try {
        await buildProgram().parseAsync(argv)
    } catch (error) {
        console.error(formatError(error))
        process.exitCode = 1
    }
}

// Run only when invoked directly. argv[1] may be a symlink (e.g. npm's global
// bin), so resolve both sides to their real paths before comparing.
export function isMainModule(entry: string | undefined, moduleUrl: string): boolean {
    if (!entry) {
        return false
    }

    try {
        return realpathSync(entry) === realpathSync(fileURLToPath(moduleUrl))
    } catch {
        return false
    }
}

if (isMainModule(process.argv[1], import.meta.url)) {
    void run(process.argv)
}
