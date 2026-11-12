# Nightstand

English | [简体中文](README.zh-CN.md)

**Make your address bar forget certain sites.**

You're giving a talk, sharing your screen, or a colleague is looking over your shoulder — and you type a few letters into the address bar, only for it to suggest a site you'd rather nobody saw. Nightstand is made for those moments. Put those sites in Nightstand's encrypted vault and it deletes their browsing history and bookmarks after every visit, so the address bar stops suggesting them.

Works in Chrome, Edge and Firefox.

## Highlights

- **Runs entirely on your device**: no account, no server, no network requests. Your list of sites is encrypted with your passphrase and stays in this computer's browser.
- **Looks like an ordinary tool**: click the icon and all you see is a working "Quick Links" launcher; type your passphrase into its filter box to get to the real list. Close the popup and it locks itself. The name, description and icon on the extensions page are just as unremarkable.
- **Covered until you choose**: open a saved site — on purpose, by accident, or when it starts playing in a background tab — and it stays covered and muted, under a plain tab title, until you click to show it. Move the mouse off it, switch tabs or leave it alone for a while and it's covered again.
- **Open source**: the code is public under the MIT license, so anyone can check that Nightstand does what it says and nothing more.

## What it does and doesn't protect against

Nightstand protects against **people who can see your screen**:

- address bar suggestions while projecting or screen sharing;
- the "most visited" tiles on the new tab page;
- the browser's history page;
- the bookmarks bar;
- the name, description and icon on the extensions page;
- someone curiously clicking the extension's icon;
- a saved site you open by accident, or one that starts playing in a background tab.

It doesn't protect against:

- someone with full control of your computer who goes digging through its data. For example, anyone who can read the extension's storage can check it against a list of common sites and work out which of them you saved;
- cloud-side records such as Google account "Web & App Activity" and search engine suggestions;
- network-level records: your workplace network, router, DNS;
- operating-system records;
- the address and icon of a covered page, which the address bar and tab strip still show;
- the extension's page in the Chrome Web Store, which the extension's details page links to: it says what Nightstand does.

## Development

Requires Node 24 and pnpm 12.

```bash
pnpm install
pnpm dev            # Chromium; for Firefox use pnpm dev:firefox
pnpm build          # output in apps/extension/dist/chromium (Firefox: pnpm build:firefox)
pnpm lint && pnpm type-check && pnpm test
pnpm test:e2e       # end-to-end tests: builds first, then drives the locally installed Chrome / Firefox
```

## License

[MIT](LICENSE)
