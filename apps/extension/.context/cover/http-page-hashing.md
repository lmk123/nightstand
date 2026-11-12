# 纯 http 页面的匹配：不引入 JS SHA-256

Decided 2026-11-09 not to add a JS SHA-256 lib (e.g. @noble/hashes) so the cover page script can hash on plain-http pages.

On plain-http pages the cover page script has no `crypto.subtle` and asks the background instead. Adding a JS SHA-256 library was measured and rejected by the user on 2026-11-09.

**Why:** Measured in real Chrome on the user's Mac. Hold time (responseStart → hold released) for unprotected pages was 19.8ms when asking a warm SW, 23.1ms when hashing locally, and 47.8ms when asking a cold SW. Only the first http page after ≥30s idle gains about 26ms. Cost: @noble/hashes sha256 is 5.7KB min (2.8KB gzip), about 42% more on the 13.5KB content script. It would also add a crypto dependency against the "只用 Web Crypto" rule.

**How to apply:** Don't re-propose a third-party (or hand-rolled) SHA-256 for this path unless new evidence shows a perceptible delay, e.g. on slow machines.
