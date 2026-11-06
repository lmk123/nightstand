# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Nightstand** is a browser extension (Chrome first, Firefox compatible). Users keep sites they don't want the address bar to suggest (during a talk, a screen share, a colleague looking over their shoulder) in an encrypted vault inside the extension — not in the bookmarks bar — and Nightstand deletes the matching browsing history after every visit. The extension itself is deliberately low-key: locked, it looks and works like an ordinary "Quick Links" launcher.

The repo is a pnpm workspace monorepo. Today it holds the extension and its pure-TS core; `apps/web` (website) and `apps/server` (e.g. end-to-end-encrypted sync) may come later — don't create them until asked.

```
apps/extension/   @nightstand/extension — Extension.js + React 19 + Tailwind v4 + shadcn/ui
packages/core/    @nightstand/core — pure TypeScript: model, URL matching, crypto, backup format
```

## Commands

Package manager is **pnpm 12** (`packageManager` in the root `package.json`). Run from the repo root:

```bash
pnpm dev                # extension dev server + browser (Chromium); pnpm dev:firefox for Firefox
pnpm build              # production build → apps/extension/dist/chromium (build:firefox too)
pnpm lint               # ESLint in every package + manifest wording check
pnpm type-check         # tsc --noEmit (TS 7) in every package — the build does NOT fail on type errors
pnpm test               # Vitest (packages/core only)
pnpm --filter @nightstand/core test:watch
pnpm --filter @nightstand/extension icons   # re-render icons-src/*.svg → public/icons/<set>/<size>.png
```

Pass Extension.js flags straight after the script name inside the package, e.g. `pnpm --filter @nightstand/extension run dev --browser=firefox`. Do **not** insert `--`: pnpm forwards it literally and Extension.js then reads the flag as a project path ("Manifest file not found").

Run `lint`, `type-check` and `test` after every non-trivial change. The extension package has no unit tests by design; correctness of anything testable belongs in `packages/core`.

### TypeScript 6 and 7 side by side (on purpose)

`typescript-eslint` throws on the TS 7 API, so both packages use the official side-by-side setup, with versions pinned once in the `catalog:` of `pnpm-workspace.yaml`:

- `"typescript": "npm:@typescript/typescript6"` — what `require('typescript')` resolves to (ESLint, editor tsserver).
- `"typescript-7": "npm:typescript"` — the real TS 7 `tsc` that `type-check` runs.

Collapse back to one `typescript` once typescript-eslint#10940 ships.

## Hard rules

- **`packages/core` stays pure.** No browser-extension APIs, no DOM, no React. Its `tsconfig.json` has `lib: ["ES2024", "WebWorker"]` and `types: []`, so `window`, `document` and `chrome` are type errors there; it has no React/chrome dependencies. Only standard Web APIs (`URL`, `crypto.subtle`, `TextEncoder`, `btoa`/`atob`). Core returns error codes, never user-facing text.
- **Only Web Crypto.** No third-party crypto libraries.
- **Offline only.** No backend, accounts, analytics, or any remote request.
- **One UI surface: the action popup.** No options page, side panel, new-tab override, and never open an extension tab. Every screen (onboarding, decoy, decoy settings, lock screen, vault list, real settings…) is a view inside the popup.
- **No content scripts, no host permissions.** Permissions: `storage`, `history`, `tabs`, `alarms`; `bookmarks` is optional and requested on use.
- **The vault key (DEK) lives only in popup memory.** Never write it to any storage (including `storage.session`) and never send it to the background. Closing the popup destroys it — that *is* the lock. No "stay unlocked for N minutes", no timers, no `idle`.
- **No plaintext on disk.** Never persist edit drafts or other decrypted data to storage.
- **Onboarding writes nothing until its last step.** Closing the popup mid-onboarding must leave storage empty.
- **Neutral wording wherever a bystander can look.** Manifest name/description/title/command descriptions must never contain words like private, hide, secret, 隐私, 隐藏, 私密 — `apps/extension/tools/check-manifest-words.mjs` enforces this in `lint`. Storage keys are neutral too (`shelf`, `index`, `links`, `throttle`, `state`).
- **i18n from day one.** Every UI string goes through `t()` from `apps/extension/src/platform/i18n.ts`; no hard-coded copy in components. The only locale today is `zh_CN` (also `default_locale`). Add keys to `apps/extension/_locales/zh_CN/messages.json`; the key type is derived from that file, so a missing key is a type error.
- **Storage formats are versioned and migrations are tested.** Any change to the stored vault or backup format needs a new version, a migration step, and a test that still decrypts the committed v1 fixture.
- When a decision belongs to the user (UI style, defaults, UX trade-offs), list the options and ask instead of assuming.

## Threat model (every design trade-off follows this)

- **Defended against: bystanders.** Address-bar suggestions while projecting or screen sharing, the new-tab "most visited" tiles, `chrome://history`, the bookmarks bar, the extension's name/description on the extensions page, and someone curiously clicking the toolbar icon.
- **Not defended against:** someone with full control of the machine doing forensics, Google account "Web & App Activity", DNS/network-layer logs, OS-level records. The README must state these limits honestly.
- The plaintext match table stores salted SHA-256 hashes of protected hosts (salt random per device). That only stops someone casually browsing storage; it does not stop hashing a list of common domains and comparing. Say so in comments and the README.

## Extension architecture notes

- Extension.js treats `src/manifest.json` as the build graph. Keys prefixed `chromium:` / `firefox:` are split per target (e.g. `background.chromium:service_worker` vs `firefox:scripts`); both targets use MV3. At runtime branch on `isChromiumLike` / `isFirefoxLike` from `src/lib/browser.ts` (never `!isFirefoxLike` for Chromium), and use `firefoxBrowser()` for Firefox-only APIs.
- Extension.js special folders live next to `apps/extension/package.json`, not under `src/`: `_locales/`, `public/` (copied verbatim to the output root — icon sets live in `public/icons/<set>/`, referenced at runtime as `icons/<set>/<size>.png`). `scripts/` and `pages/` are special too (every file becomes an entry point), which is why Node helpers live in `tools/`.
- The built popup is emitted as `action/index.html`; the background as `background/service_worker.js` (Chromium).
- `@nightstand/core` is consumed as TypeScript source (`exports` → `src/index.ts`); Extension.js transpiles it directly, there is no core build step.
- `extension-env.d.ts` is generated by Extension.js and gitignored; `env.d.ts` carries the same references so `type-check` works on a fresh clone.
- shadcn/ui: `pnpm dlx shadcn@latest add <name>` from `apps/extension`; components land in `src/components/ui`. Keep the generated code as the CLI writes it — it imports `cn` from the official [`cn`](https://github.com/shadcn-ui/cn) package (shadcn's drop-in replacement for clsx + tailwind-merge); use that same import in app code. `assets.d.ts` must stay a script (no top-level import/export).
- Chromium rejects SVG for action/manifest icons: edit `icons-src/*.svg`, run the `icons` script, commit the PNGs.

## Manual acceptance checklist

Walk through the relevant items in a real browser for every milestone that touches them. Use test domains such as `example.com` / `example.org`.

1. Add `example.com` (site mode), visit `https://www.example.com/foo`, then: `chrome://history` search "example" → no results; new tab, type `exa` in the address bar → no history suggestion; new-tab "most visited" → not there.
2. Visit a site and bookmark it *before* adding it, then add it: existing history is cleared and you're prompted to handle the bookmark.
3. Visit a look-alike such as `evil-example.com`: it must **not** be cleaned.
4. While locked, visit a protected site: history is still cleaned.
5. Open the popup while locked: only Quick Links are visible; a wrong passphrase gives no hint at all; the right passphrase + Enter unlocks.
6. Unlock, close the popup, reopen: back to the decoy, passphrase required again.
7. Fresh install, first popup open: onboarding (not the decoy). Close the popup mid-onboarding and reopen: onboarding restarts and storage holds no vault data.
8. Press the panic shortcut: matching tabs and incognito windows Nightstand opened are closed, and an open popup closes.
9. The extensions page shows nothing revealing (name, description, icon), and no extension tab was ever opened during use.

Also verify, and document under "Known limitations" in the README: whether the Chrome address bar still suggests protected sites from bookmarks, open tabs, search-engine suggestions (server side, tied to Google account activity) or the omnibox "shortcuts" database after history deletion; and whether `history.deleteUrl` also deletes on other devices when Chrome Sync is on.

## Testing in a real browser (what has worked)

- **Chrome**: launch Google Chrome with `puppeteer-core` (`pipe: true`, `enableExtensions: [<dist/chromium>]`, a fresh `userDataDir`). The extension id comes from the service-worker target; `worker.evaluate()` reaches `chrome.*` in the background. Opening `chrome-extension://<id>/action/index.html` in a tab drives the popup UI headless. `--host-resolver-rules=MAP * 127.0.0.1:<port>` plus a local HTTP server makes `example.com` & co. real visits that land in history.
- **The real popup** (needed for focus-related behaviour): run headed and call `chrome.action.openPopup({windowId})` from the service worker after focusing a normal window. Findings: a `permissions.request` prompt **closes** the popup; a file chooser does **not** (Chrome on macOS); a blob download completes after the popup closes.
- **Firefox**: puppeteer's WebDriver BiDi can install the add-on (`browser.installExtension`) but refuses to navigate to or expose `moz-extension://` pages, so the popup UI can't be driven there. Background behaviour can be verified by seeding storage from a test-only copy of the build and reading `places.sqlite` with `sqlite3` after closing the browser. Popup-only Firefox branches (paste-based backup import, private-window wording) still need a manual pass with `pnpm dev:firefox`.
- The bookmarks permission prompt can't be accepted headless; test the granted path with a copy of the build whose manifest lists `bookmarks` as a required permission.

## MCP servers

`.mcp.json` wires three servers:

- **extension-dev** (`@extension.dev/mcp`) — build-aware project control (dev server, reload, generated manifest, storage, logs).
- **chrome-devtools** (`chrome-devtools-mcp`) — raw CDP debugging; needs a Chrome listening on `http://127.0.0.1:9222`.
- **extensionjs** — hosted Extension.js docs; prefer it over memory for "how do I…" Extension.js questions.
