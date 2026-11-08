# Nightstand

English | [简体中文](README.zh-CN.md)

A browser extension (Chrome first, Firefox compatible). Some sites you'd rather the address bar didn't suggest while you're giving a talk, sharing your screen, or a colleague is looking over your shoulder. Nightstand keeps those sites in an encrypted list inside the extension instead of in your bookmarks bar, and deletes the matching browsing history after every visit, so typing a few letters into the address bar no longer brings them up.

The extension itself keeps a low profile too: click its icon while it's locked and all you see is an ordinary, working "Quick Links" launcher.

## Features

- **Encrypted list**: add the current tab or type a URL by hand; search, edit, delete. To prevent misclicks, a single click on a row only selects it — open it with that row's "Open" button or Enter. While searching, the first result is selected automatically and ↑↓ moves the selection. Each entry has a clean-up scope:
  - **Whole site** (default): only the domain counts, including all subdomains; path, protocol and port are ignored.
  - **This URL only**: matches just this one address. The protocol, a leading `www.`, anything after `#` and a trailing slash don't affect the match; the parameters after `?` must match exactly. The site's other pages stay in history.
  - **Extra domains**: each entry can also list a few other domains, always treated as "Whole site" (including all subdomains) whichever scope the entry itself uses. Meant for other domains the site sends you to, such as a payment page or the domain that plays its videos (e.g. `video.twimg.com`): their history and bookmarks are deleted together with the entry's, both when you save and on every later visit. A "+N" after an entry in the list means it has N extra domains. If you don't know which domains to add, search `chrome://history` for the site's domain or for words in its titles and see which results are on other domains (the form's "What are extra domains, and how do I find them?" explains how).
  - The form's "What's the difference between the two options?" opens the in-popup FAQ, which walks through examples.
- **Automatic history cleaning**
  - History is deleted right after you visit a protected site, along with the site's related records (redirects, subpages).
  - Adding an entry immediately cleans the site's existing history.
  - A full sweep runs when the browser starts, then an incremental sweep every 15 minutes.
  - **Cleaning keeps working while locked.**
- **Decoy screen**: while locked, the popup shows an ordinary Quick Links launcher. The default links are GitHub, MDN, Google Docs and Gmail, and you can change them. Type your passphrase into the "Filter…" box and press Enter to unlock. A wrong passphrase gives no hint at all.
- **Closing locks it**: the unlocked state exists only in the popup's memory. Close the popup and it's locked; there is no "stay unlocked for N minutes" option.
- **Quick close**: default shortcut `Alt+Shift+Q` (⌥⇧Q on a Mac). It closes tabs of protected sites and the Incognito windows Nightstand opened, cleans history right away, and closes the popup.
- **Three ways to open links**: current tab, new tab, Incognito window (a private window on Firefox). An Incognito window never creates browsing history in the first place, so it's the cleanest option, but you first have to allow Nightstand to run in Incognito on the extension's details page.
- **Bookmarks**: saving an entry also deletes bookmarks pointing to that site (or URL), so they stop showing up in address bar suggestions. You can also bulk-import from bookmarks and optionally delete the originals afterwards.
- **Confirm before saving**: before saving, the popup lists what's about to be deleted — how many pages of browsing history and how many bookmarks — and saves only once you confirm. You can tick "Don't show again" and turn it back on in Settings.
- **Check after saving**: after you add an entry, or change its URL / scope / extra domains, a note at the top of the list asks you to open a new tab right away and type the first few letters of the domain into the address bar to see whether the site still shows up. If it does, the site usually sent you to another domain; add that domain to "Extra domains".
- **FAQ**: the unlocked Settings view has an FAQ that explains the two scopes, what extra domains are and how to find them in `chrome://history` by domain or title keywords, and how data is stored and whether it can be cracked. It's a view inside the popup and never opens a new tab.
- **Backup and restore**
  - Export an encrypted `.nightstand` backup and import it with the passphrase or recovery code in use at the time; imports are merged with existing entries and de-duplicated.
  - You can export a plain-text list, behind a prominent warning.
- **Passphrase management**: the passphrase needs at least 4 characters; its strength isn't rated. You can change the passphrase and generate a new recovery code. If you forget the passphrase, paste the recovery code into the filter box and press Enter to set a new one.
- **Appearance**: the toolbar icon can be a nightstand, book, star or grid (in the unlocked Settings; it can't be changed while locked). The name and description on the extensions page are neutral: Nightstand, "Keep your everyday links close at hand".
- **Languages**: English and Simplified Chinese, following the browser's language.

## How to use

1. The first time you click the icon after installing, a setup guide asks you to choose a passphrase and save a recovery code. It's the only screen that explains what Nightstand is for, so it's best to finish it when no one else can see your screen.
2. The passphrase should **look like an ordinary filter term**, because you'll be typing it into a filter box. A few unrelated words separated by spaces are inconspicuous and long enough; a single word is easy to guess offline.
3. From then on, clicking the icon shows "Quick Links". Type the passphrase into the filter box and press Enter to get to the real list. While locked it always looks like this; there is no separate passphrase screen.

## Threat model

**Nightstand protects against bystanders**, including:

- address bar suggestions while projecting or screen sharing;
- the "most visited" tiles on the new tab page;
- the `chrome://history` page;
- the bookmarks bar;
- the name, description and icon on the extensions page;
- someone curiously clicking the extension's icon.

**Nightstand does not protect against**:

- someone with full control of the computer doing forensic analysis;
- server-side records such as Google account "Web & App Activity";
- network-level logs: DNS, proxies, routers;
- operating-system records such as caches, swap and the DNS cache.

### Encryption design

- The whole list is encrypted with a randomly generated data key (AES-256-GCM) and kept in `storage.local`; **`storage.sync` is never used**.
- The data key is wrapped twice:
  - once with a key derived from the passphrase via PBKDF2-SHA256, 600,000 iterations, random salt;
  - once with a key derived from the recovery code, which carries 160 bits of randomness.
- Once unlocked, the data key exists only in the popup page's memory. It's never written to any storage or sent to the background, and it's destroyed when the popup closes.
- Only the browser's built-in Web Crypto API is used; no third-party crypto libraries.
- Both the storage format and the backup format are versioned. The repository has a fixed v1 test fixture that every future version must still decrypt, so an update can never make a passphrase stop working or lose data. The list contents (the decrypted data) are currently at version 4: version 2 added extra domains, version 3 removed notes and tags, version 4 added site icons. Older versions are upgraded automatically when read.

### How cleaning works while locked: the hashed match table

While locked the list can't be decrypted, so the background keeps a separate plaintext "match table": each protected host name (extra domains included) or URL, combined with a salt generated randomly on this device, hashed with SHA-256 — only the result is stored.

**This only stops someone casually browsing the extension's storage.** Anyone who can read the match table and the salt can hash a list of common domains and compare, recovering some of the sites. That's outside the threat model, but you should know about it.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Keeps the encrypted list, the hashed match table and the Quick Links settings (local storage only) |
| `history` | Deletes the browsing history of protected sites — the core feature |
| `tabs` | Reads the current tab's URL and title so it can be added; finds and closes protected sites' tabs on quick close |
| `alarms` | Runs the periodic incremental sweep |
| `bookmarks` | Counts and deletes a site's bookmarks when an entry is saved; imports from bookmarks |
| `favicon` (Chrome only) | Reads site icons from the browser's local icon cache for the list |

No host permissions, no scripts injected into web pages, no network requests: it runs entirely offline. Site icons are no exception — only icons Chrome has already cached locally are read; nothing is downloaded from the sites.

### Site icons

- When Chrome deletes a page's browsing history, it deletes the page's cached icon with it (verified). So an entry's icon is captured as a 32×32 PNG **at the moment it's saved** (before the history is deleted) and stored encrypted with the entry. Sites you've never visited, with no icon in the browser's cache, show the title's first letter.
- For an entry saved without an icon, visit the site once and it will be looked up in the local cache again **the next time you unlock**, and stored if found (the popup closes as soon as you open a site, so this has to wait for the next unlock). This relies on timing: the background deletes the history as soon as the visit is recorded, while the icon is usually written to the cache only after it has been downloaded, so it survives (verified). If the icon is written first (e.g. it was already in the browser cache and loaded instantly), it's deleted together with the history; it won't be found this time, and the next visit tries again.
- In other words, icons of protected sites you've visited may remain in Chrome's icon cache file. They don't appear in the address bar, the history page or the new tab page — only someone reading the browser's data files directly could see them, which is outside the threat model.
- Quick Links are ordinary sites whose history isn't deleted, so their icons are read straight from the local cache each time the popup opens; without a cached icon they show the first letter.
- Firefox has no API for reading the local icon cache, so it always shows first letters.
- The plain-text export doesn't include icons.

## Known limitations

| Item | Status |
|---|---|
| Cleaning after a visit, while locked, and of existing history when adding; subdomain matching; look-alike domains such as `evil-example.com` are not deleted by mistake | Verified in Chrome; in Firefox the background cleaning is verified against a real `places.sqlite` |
| Chrome records the intermediate URLs of a redirect chain (e.g. the automatic http→https upgrade after typing a domain into the address bar) as entries `history.search` can't find, yet the address bar still suggests them | Cleaning deletes these by URL directly: the http/https and with/without `www.` forms of each deleted URL, plus those forms of the site's home page (or the exact URL) when an entry is saved. Intermediate URLs that hop to other paths or domains can't be enumerated, so they aren't deleted |
| When a site redirects by script (`location.replace` and the like, common in sign-in, CAPTCHA, payment and refresh flows), the page before the redirect is likewise an entry `history.search` can't find; its URL often carries random parameters (e.g. `/chat?c=…`) and may be on another domain | Visits after the entry is added: the background sees the visit and deletes it on the spot (verified in Chrome). Records left before adding: in Chrome, each record is deleted by visit time (`history.deleteRange`, a window of about 2 microseconds), and Chrome then also deletes the whole redirect chain leading to that visit, just like deleting it in `chrome://history` (verified, including chains coming from other domains). **What can't be deleted**: chains that end outside the protected scope (e.g. a protected site sending you to a payment page on another domain) — add that domain too, or delete the final record in `chrome://history`; if the address bar still suggests it, select the suggestion and press Shift+Delete (Shift+Fn+Delete on a Mac). Firefox doesn't delete by time (it's only precise to the millisecond) |
| The extension's own pages (the popup) don't stay in history | Verified in Chrome (the background also actively deletes records of the extension's own pages) |
| New tab "most visited": generated from browsing history, so it should disappear once the history is deleted | To be confirmed manually |
| Address bar **bookmark** suggestions: bookmarks aren't affected by history cleaning | Saving an entry deletes the site's bookmarks; bookmarks added later aren't deleted automatically, but are deleted the next time the entry is saved |
| Address bar **open tab** suggestions ("Switch to this tab"): unavoidable while the tab is open | Use quick close to close those tabs |
| Address bar **search suggestions**: generated server-side by the search engine and tied to account activity; the extension can't control them | Outside the scope of protection |
| The address bar's **shortcuts database** (entries you once picked from the address bar): Chrome should clear the matching shortcuts when deleting history | To be confirmed manually |
| With Chrome Sync on, whether `history.deleteUrl` also deletes records on other devices | To be confirmed manually; don't rely on it |
| An exported backup's file name appears in the browser's download history | The file name is a neutral `nightstand-<date>.nightstand` |
| On Firefox, opening a file chooser from the popup usually closes the popup, so on Firefox you import a backup by pasting the file's contents | Firefox pastes, Chrome uses the file chooser (verified that the popup stays open) |
| No limit or delay on wrong passphrases | On purpose: throttling would block the owner too (after pressing Enter in the filter box a few times, even the right passphrase would be silently ignored), and it does little against a bystander guessing by hand. Guessing is countered only by passphrase strength and PBKDF2 |

## Development

Requires Node 24 and pnpm 12.

```bash
pnpm install
pnpm dev            # Chromium; for Firefox use pnpm dev:firefox
pnpm build          # output in apps/extension/dist/chromium (Firefox: pnpm build:firefox)
pnpm lint && pnpm type-check && pnpm test
pnpm test:e2e       # end-to-end tests: builds first, then drives the locally installed Chrome / Firefox
```

The end-to-end tests live in `apps/extension/e2e/` and drive real browsers with Vitest + puppeteer-core, covering onboarding, adding/editing/deleting entries, history cleaning, the decoy screen, panic, backups, bookmark import and which UI language each browser language gets. The real popup's focus-related behaviour needs a visible window; run it with `E2E_HEADED=1 pnpm test:e2e`.

### Layout

```
apps/extension/   the browser extension (@nightstand/extension): Extension.js + React 19 + Tailwind v4 + shadcn/ui
packages/core/    pure TypeScript core (@nightstand/core): data model, URL matching, crypto, backup format
```

`packages/core` doesn't depend on any browser-extension API, the DOM or React; its unit tests run on Vitest.

Planned for later:

- `apps/web`: the website;
- `apps/server`: a backend, e.g. for end-to-end-encrypted sync.

Both can reuse `packages/core` directly.

All UI text comes from `apps/extension/_locales/`: English (`en`, the default) and Simplified Chinese (`zh_CN`). Browsers set to Simplified Chinese get Chinese; every other language, Traditional Chinese included, gets English. `pnpm lint` checks that both catalogs have the same entries and placeholders.

## License

[MIT](LICENSE)
