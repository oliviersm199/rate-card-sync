export type RateType = "FLAT" | "PERCENTAGE" | "SUBSCRIPTION" | "TIERED" | "TIERED_PERCENTAGE" | "CUSTOM"

export type BillingFrequency = "MONTHLY" | "QUARTERLY" | "ANNUAL" | "WEEKLY"

export interface Tier {
    size?: number
    price: number
}

export interface CanonicalCommitRate {
    rateType: RateType
    price?: number
    tiers?: Tier[]
}

export interface CanonicalRate {
    productId: string
    productName: string
    rateType: RateType
    entitled: boolean
    price?: number
    creditTypeId?: string
    pricingGroupValues?: Record<string, string>
    billingFrequency?: BillingFrequency
    tiers?: Tier[]
    customRate?: Record<string, unknown>
    quantity?: number
    isProrated?: boolean
    commitRate?: CanonicalCommitRate
}

export interface CanonicalRateAdd {
    productId: string
    rateType: RateType
    entitled: boolean
    startingAt: string
    price?: number
    creditTypeId?: string
    pricingGroupValues?: Record<string, string>
    billingFrequency?: BillingFrequency
    tiers?: Tier[]
    customRate?: Record<string, unknown>
    quantity?: number
    isProrated?: boolean
    commitRate?: CanonicalCommitRate
}

export interface ProductMaps {
    nameToId: Map<string, string>
    idToName: Map<string, string>
}

export interface RateCardRef {
    id: string
    name: string
}

export interface RateCardProvider {
    readonly name: string
    resolveRateCard(nameOrId: string): Promise<RateCardRef>
    listProducts(): Promise<ProductMaps>
    getRates(rateCardId: string, at: string): Promise<CanonicalRate[]>
    addRates(rateCardId: string, rates: CanonicalRateAdd[]): Promise<void>
}

export interface ResourceContext {
    rateCardId: string
    rateCardName: string
    products: ProductMaps
}
