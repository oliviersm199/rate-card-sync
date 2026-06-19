import Metronome from "@metronome/sdk"
import { validate as validateUuid } from "uuid"

import type { BillingFrequency, CanonicalCommitRate, CanonicalRate, CanonicalRateAdd, ProductMaps, RateCardProvider, RateCardRef, RateType, Tier } from "./types.js"

type SdkCommitRate = NonNullable<Metronome.V1.Contracts.RateCards.Rates.RateAddManyParams.Rate["commit_rate"]>

function normalizeRateType(value: string): RateType {
    return value.toUpperCase() as RateType
}

function mapTiers(tiers: ReadonlyArray<{ size?: number; price: number }>): Tier[] {
    return tiers.map(tier => {
        const mapped: Tier = { price: tier.price }
        if (tier.size !== undefined) {
            mapped.size = tier.size
        }
        return mapped
    })
}

function mapCommitRateFromSdk(commitRate: SdkCommitRate): CanonicalCommitRate {
    const mapped: CanonicalCommitRate = { rateType: normalizeRateType(commitRate.rate_type) }

    if (commitRate.price !== undefined) {
        mapped.price = commitRate.price
    }

    if (commitRate.tiers) {
        mapped.tiers = mapTiers(commitRate.tiers)
    }

    return mapped
}

function mapCommitRateToSdk(commitRate: CanonicalCommitRate): SdkCommitRate {
    const mapped: SdkCommitRate = { rate_type: commitRate.rateType }

    if (commitRate.price !== undefined) {
        mapped.price = commitRate.price
    }

    if (commitRate.tiers) {
        mapped.tiers = mapTiers(commitRate.tiers)
    }

    return mapped
}

function normalizeBillingFrequency(value: string | undefined): BillingFrequency | undefined {
    if (!value) {
        return undefined
    }

    return value.toUpperCase() as BillingFrequency
}

function mapListResponse(entry: Metronome.V1.Contracts.RateCards.Rates.RateListResponse): CanonicalRate {
    const rate: CanonicalRate = {
        productId: entry.product_id,
        productName: entry.product_name,
        rateType: normalizeRateType(entry.rate.rate_type),
        entitled: entry.entitled
    }

    if (entry.rate.price !== undefined) {
        rate.price = entry.rate.price
    }

    if (entry.rate.credit_type?.id) {
        rate.creditTypeId = entry.rate.credit_type.id
    }

    if (entry.pricing_group_values) {
        rate.pricingGroupValues = entry.pricing_group_values
    }

    if (entry.billing_frequency) {
        const billingFrequency = normalizeBillingFrequency(entry.billing_frequency)
        if (billingFrequency) {
            rate.billingFrequency = billingFrequency
        }
    }

    if (entry.rate.tiers) {
        rate.tiers = mapTiers(entry.rate.tiers)
    }

    if (entry.rate.custom_rate) {
        rate.customRate = entry.rate.custom_rate
    }

    if (entry.rate.quantity !== undefined) {
        rate.quantity = entry.rate.quantity
    }

    if (entry.rate.is_prorated !== undefined) {
        rate.isProrated = entry.rate.is_prorated
    }

    if (entry.commit_rate) {
        rate.commitRate = mapCommitRateFromSdk(entry.commit_rate)
    }

    return rate
}

function mapAddRate(rate: CanonicalRateAdd): Metronome.V1.Contracts.RateCards.Rates.RateAddManyParams.Rate {
    const payload: Metronome.V1.Contracts.RateCards.Rates.RateAddManyParams.Rate = {
        product_id: rate.productId,
        rate_type: rate.rateType,
        entitled: rate.entitled,
        starting_at: rate.startingAt
    }

    if (rate.price !== undefined) {
        payload.price = rate.price
    }

    if (rate.creditTypeId) {
        payload.credit_type_id = rate.creditTypeId
    }

    if (rate.pricingGroupValues) {
        payload.pricing_group_values = rate.pricingGroupValues
    }

    if (rate.billingFrequency) {
        payload.billing_frequency = rate.billingFrequency
    }

    if (rate.tiers) {
        payload.tiers = mapTiers(rate.tiers)
    }

    if (rate.customRate) {
        payload.custom_rate = rate.customRate
    }

    if (rate.quantity !== undefined) {
        payload.quantity = rate.quantity
    }

    if (rate.isProrated !== undefined) {
        payload.is_prorated = rate.isProrated
    }

    if (rate.commitRate) {
        payload.commit_rate = mapCommitRateToSdk(rate.commitRate)
    }

    return payload
}

export class MetronomeProvider implements RateCardProvider {
    readonly name = "metronome"

    private readonly client: Metronome

    constructor(client?: Metronome) {
        this.client = client ?? new Metronome()
    }

    async resolveRateCard(nameOrId: string): Promise<RateCardRef> {
        if (validateUuid(nameOrId)) {
            const response = await this.client.v1.contracts.rateCards.retrieve({ id: nameOrId })
            return { id: response.data.id, name: response.data.name }
        }

        for await (const card of this.client.v1.contracts.rateCards.list({ body: {} })) {
            if (card.name === nameOrId) {
                return { id: card.id, name: card.name }
            }
        }

        throw new Error(`Rate card not found: ${nameOrId}`)
    }

    async listProducts(): Promise<ProductMaps> {
        const nameToId = new Map<string, string>()
        const idToName = new Map<string, string>()

        for await (const product of this.client.v1.contracts.products.list({ archive_filter: "NOT_ARCHIVED" })) {
            nameToId.set(product.current.name, product.id)
            idToName.set(product.id, product.current.name)
        }

        return { nameToId, idToName }
    }

    async getRates(rateCardId: string, at: string): Promise<CanonicalRate[]> {
        const rates: CanonicalRate[] = []

        for await (const entry of this.client.v1.contracts.rateCards.rates.list({
            rate_card_id: rateCardId,
            at
        })) {
            rates.push(mapListResponse(entry))
        }

        return rates
    }

    async addRates(rateCardId: string, rates: CanonicalRateAdd[]): Promise<void> {
        if (rates.length === 0) {
            return
        }

        await this.client.v1.contracts.rateCards.rates.addMany({
            rate_card_id: rateCardId,
            rates: rates.map(mapAddRate)
        })
    }
}
