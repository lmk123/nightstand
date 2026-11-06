# Nightstand

A browser extension (Chrome first, Firefox compatible) that keeps a small set of sites out of your address-bar suggestions. Work in progress — full documentation (features, threat model, known limitations, permissions) lands with the first release.

## Repository layout

```
apps/extension/   the browser extension (@nightstand/extension)
packages/core/    pure TypeScript core shared by future apps (@nightstand/core)
```

Planned later: `apps/web` (website) and `apps/server` (e.g. end-to-end-encrypted sync). `packages/core` has no browser or React dependencies so those apps can reuse it as is.

## Development

```bash
pnpm install
pnpm dev          # Chromium; pnpm dev:firefox for Firefox
pnpm lint && pnpm type-check && pnpm test
```
