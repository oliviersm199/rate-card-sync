import { writeFile } from "node:fs/promises"

import { getProvider } from "./providers/index.js"
import type { ResourceContext } from "./providers/types.js"
import { getResourceModules } from "./resources/index.js"
import { type RateCardSpec, dumpSpec } from "./spec.js"

export interface ExtractOptions {
    rateCard: string
    providerName?: string
    out?: string
}

export async function extract(options: ExtractOptions): Promise<string> {
    const provider = getProvider(options.providerName ?? "metronome")
    const rateCard = await provider.resolveRateCard(options.rateCard)
    const products = await provider.listProducts()

    const ctx: ResourceContext = {
        rateCardId: rateCard.id,
        rateCardName: rateCard.name,
        products
    }

    const spec: RateCardSpec = {
        provider: "metronome",
        rateCard: { name: rateCard.name, id: rateCard.id },
        rates: []
    }

    for (const module of getResourceModules()) {
        const items = await module.list(provider, ctx)
        Object.assign(spec, { [module.key]: items })
    }

    const yaml = dumpSpec(spec)

    if (options.out) {
        await writeFile(options.out, yaml, "utf8")
    }

    return yaml
}
