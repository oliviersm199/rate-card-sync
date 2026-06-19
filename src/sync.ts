import { readFile } from "node:fs/promises"
import pc from "picocolors"

import { diff, hasChanges } from "./diff.js"
import { getProvider } from "./providers/index.js"
import type { ResourceContext } from "./providers/types.js"
import { getResourceModules } from "./resources/index.js"
import type { ResourceModule } from "./resources/types.js"
import { loadSpec } from "./spec.js"

export interface SyncOptions {
    specPath: string
    dryRun?: boolean
    exitCode?: boolean
}

export interface SyncResult {
    hasPendingChanges: boolean
}

function formatItem(item: unknown): string {
    return JSON.stringify(item)
}

function printModulePlan(module: ResourceModule<unknown>, result: ReturnType<typeof diff<unknown>>): void {
    console.log(pc.bold(`\n[${module.key}]`))

    for (const item of result.toAdd) {
        console.log(pc.green(`  + add ${formatItem(item)}`))
    }

    for (const change of result.changed) {
        console.log(pc.yellow(`  ~ change ${formatItem(change.current)}`))
        console.log(pc.yellow(`      -> ${formatItem(change.desired)}`))
    }

    for (const item of result.unchanged) {
        console.log(pc.dim(`  = unchanged ${formatItem(item)}`))
    }

    for (const item of result.extra) {
        console.log(pc.cyan(`  ! extra (not in spec) ${formatItem(item)}`))
    }
}

export async function sync(options: SyncOptions): Promise<SyncResult> {
    const source = await readFile(options.specPath, "utf8")
    const spec = loadSpec(source)
    const provider = getProvider(spec.provider)
    const rateCardInput = spec.rateCard.name ?? spec.rateCard.id

    if (!rateCardInput) {
        throw new Error("rateCard requires name or id")
    }

    const rateCard = await provider.resolveRateCard(rateCardInput)
    const products = await provider.listProducts()

    const ctx: ResourceContext = {
        rateCardId: rateCard.id,
        rateCardName: rateCard.name,
        products
    }

    let pendingChanges = false

    for (const module of getResourceModules()) {
        const desired = spec[module.key as keyof typeof spec]

        if (!Array.isArray(desired)) {
            throw new Error(`Spec section "${module.key}" must be an array`)
        }

        const parsedDesired = module.schema.parse(desired)
        const current = await module.list(provider, ctx)
        const result = diff(current, parsedDesired, {
            identity: item => module.identity(item),
            equals: (a, b) => module.equals(a, b)
        })

        printModulePlan(module, result)

        if (hasChanges(result)) {
            pendingChanges = true
        }

        if (!options.dryRun && hasChanges(result)) {
            await module.apply(provider, ctx, {
                toAdd: result.toAdd,
                changed: result.changed,
                extra: result.extra
            })
        }
    }

    if (options.dryRun) {
        console.log(pc.bold(`\nDry run: no changes applied.`))
    } else if (pendingChanges) {
        console.log(pc.bold(`\nApplied pending changes.`))
    } else {
        console.log(pc.bold(`\nNo changes needed.`))
    }

    return { hasPendingChanges: pendingChanges }
}

export function resolveSyncExitCode(result: SyncResult, exitCodeEnabled: boolean, dryRun: boolean): number {
    if (!exitCodeEnabled) {
        return 0
    }

    if (result.hasPendingChanges) {
        return dryRun ? 2 : 0
    }

    return 0
}
