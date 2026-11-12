# http 页面遮罩的等待时长

仅指在用户的一台 Mac 上用真实 Chrome 测得的数值，换机器（尤其是慢机器）需要重测。

| 日期 | 版本/改动 | 数值 | 测法 |
|---|---|---|---|
| 2026-11-09 | asking a warm SW | 19.8ms | Measured in real Chrome on the user's Mac. Hold time (responseStart → hold released) for unprotected pages |
| 2026-11-09 | hashing locally（JS SHA-256） | 23.1ms | 同上 |
| 2026-11-09 | asking a cold SW（≥30s idle 后的第一个 http 页） | 47.8ms | 同上 |
| 2026-11-09 | @noble/hashes sha256 体积 | 5.7KB min (2.8KB gzip)，about 42% more on the 13.5KB content script | 未记录 |
