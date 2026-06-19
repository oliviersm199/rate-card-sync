import { parse, stringify } from "yaml"
import { z } from "zod"

import { getResourceModules } from "./resources/index.js"

const rateCardSchema = z
    .object({
        name: z.string().min(1).optional(),
        id: z.string().uuid().optional()
    })
    .refine(data => Boolean(data.name || data.id), {
        message: "rateCard requires name or id"
    })

function buildSpecSchema() {
    const shape: Record<string, z.ZodTypeAny> = {
        provider: z.enum(["metronome"]).default("metronome"),
        rateCard: rateCardSchema
    }

    for (const module of getResourceModules()) {
        shape[module.key] = module.schema
    }

    return z.object(shape)
}

export const specSchema = buildSpecSchema()

export type RateCardSpec = z.infer<typeof specSchema>

export function loadSpec(source: string): RateCardSpec {
    const parsed = parse(source)

    const result = specSchema.safeParse(parsed)

    if (!result.success) {
        const message = result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("\n")
        throw new Error(`Invalid spec:\n${message}`)
    }

    return result.data
}

export function dumpSpec(spec: RateCardSpec): string {
    return stringify(spec, { lineWidth: 0 })
}
