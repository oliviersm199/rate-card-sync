# Rate Card Sync

CLI to extract and sync billing rate card pricing as YAML. [Metronome](https://metronome.com) is supported today.

## Install

```bash
npm install -g @oliviersm199/rate-card-sync
```

Or run without installing:

```bash
npx @oliviersm199/rate-card-sync extract --rate-card "Standard rate card"
```

## Authentication

Set a Metronome API bearer token:

```bash
export METRONOME_BEARER_TOKEN="your-token"
```

## Commands

### Extract

Pull the current rate card from Metronome into YAML:

```bash
rate-card extract --rate-card "Standard rate card" --out rate-card.yaml
```

Omit `--out` to print to stdout.

### Sync

Apply a YAML spec to Metronome:

```bash
rate-card sync rate-card.yaml
```

Preview changes without applying:

```bash
rate-card sync rate-card.yaml --dry-run
```

Exit with code `2` when changes are pending (useful in CI):

```bash
rate-card sync rate-card.yaml --dry-run --exit-code
```

## YAML spec

```yaml
provider: metronome
rateCard:
    name: Standard rate card
rates:
    - product: GPT-5 input tokens
      rateType: FLAT
      price: 500
      entitled: true
      startingAt: "2026-06-19T00:00:00.000Z"
      pricingGroupValues:
          region: us-west-2
      billingFrequency: MONTHLY
    - product: LLM output tokens
      rateType: FLAT
      price: 0
      entitled: true
      commitRate:
          rateType: FLAT
          price: 1200
```

- `provider` defaults to `metronome`
- `rateCard` requires `name` or `id`
- `startingAt` is optional on sync; defaults to now
- `price` is in the credit type's base unit (e.g. USD cents)
- `commitRate` sets the rate charged when usage is drawn down against a commit or credit; the list `price` is often `0` when pricing is defined here

See [`examples/rate-card.yaml`](examples/rate-card.yaml) for a full sample.

## GitHub Actions

Copy the workflows in [`examples/github-actions/`](examples/github-actions/):

- `validate.yml` — run `sync --dry-run --exit-code` on pull requests to gate pricing drift
- `sync.yml` — apply changes when the spec changes on `main`

Both workflows expect a `METRONOME_BEARER_TOKEN` repository secret and reuse the repo's CI workflow as a quality gate.

## Development

```bash
npm install
npm test
npm run coverage
npm run build
```

## Limitations

Need something not listed here? Open a [GitHub Issue](https://github.com/oliviersm199/rate-card-sync/issues) describing your use case (use a Feature Request) — additional rate types and capabilities can be added on request.

- Rates only — does not create, update, or archive products, rate cards, credit types, or pricing units (they must already exist in Metronome)
- Single rate card per spec file
- FLAT is the first-class rate type; `PERCENTAGE`, `SUBSCRIPTION`, `TIERED`, `TIERED_PERCENTAGE`, and `CUSTOM` are preserved on extract and passed through on sync.
- Append-only sync — never deletes or ends existing rates; rates in Metronome but absent from YAML are reported as warnings only
- `commitRate` (the rate applied when consuming a commit or credit) is extracted and synced; other contract-level overrides are not handled
- Diff identity is limited to `product` + `pricingGroupValues` + `billingFrequency`
- Metronome is the only supported provider today. If you would like to see another provider, please create an issue.
- Rates are the only declaratively managed resource today; products, credit types, and pricing units must already exist. The architecture supports adding them later as new resource modules without breaking existing specs

## License

MIT
