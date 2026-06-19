import { MetronomeProvider } from "./metronome.js"
import type { RateCardProvider } from "./types.js"

const providers: Record<string, () => RateCardProvider> = {
    metronome: () => new MetronomeProvider()
}

export function getProvider(name = "metronome"): RateCardProvider {
    const factory = providers[name]

    if (!factory) {
        const supported = Object.keys(providers).join(", ")
        throw new Error(`Unknown provider "${name}". Supported providers: ${supported}`)
    }

    return factory()
}

export type { RateCardProvider } from "./types.js"
