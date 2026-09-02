# Prayer Audio Assets — Verification Status

Verification timestamp: 2026-09-02 (task coverage — this document reflects the state at verification time).

All assets are served read-only from Supabase Storage bucket `prayer-audio` (public). Verification used minimal HEAD requests; no full downloads were performed. No storage, database, or live data was modified.

| Prayer | Slug | audio_path | HTTP | MIME | Status |
|---|---|---|---|---|---|
| Tatăl nostru | `tatal-nostru` | `ro/tatal-nostru.mp3` | 200 | audio/mpeg | OK |
| Rugăciunea lui Iisus | `rugaciunea-lui-iisus` | `ro/rugaciunea-lui-iisus.mp3` | 200 | audio/mpeg | OK |
| Împărate ceresc | `imparate-ceresc` | `ro/imparate-ceresc.mp3` | 200 | audio/mpeg | OK |
| Cuvine-se cu adevărat | `cuvine-se-cu-adevarat` | `ro/cuvine-se-cu-adevarat.mp3` | 200 | audio/mpeg | OK |
| Sfinte Dumnezeule | `sfinte-dumnezeule` | `ro/sfinte-dumnezeule.mp3` | 200 | audio/mpeg | OK |
| Preasfântă Treime | `preasfanta-treime` | `ro/preasfanta-treime.mp3` | 200 | audio/mpeg | OK |
| Slavă Tatălui | `slava-tatalui` | `ro/slava-tatalui.mp3` | 200 | audio/mpeg | OK |
| Născătoare de Dumnezeu Fecioară | `nascatoare-de-dumnezeu-fecioara` | `ro/nascatoare-de-dumnezeu-fecioara.mp3` | 200 | audio/mpeg | OK |
| Sub milostivirea ta | `sub-milostivirea-ta` | `ro/sub-milostivirea-ta.mp3` | 200 | audio/mpeg | OK |
| Rugăciunea vameșului | `rugaciunea-vamesului` | `ro/rugaciunea-vamesului.mp3` | 200 | audio/mpeg | OK |

## Summary

- **10** published prayers checked, each with a configured `audio_path`.
- **10 / 10** assets verified present (HTTP 200) with valid `audio/mpeg` MIME.
- **0** missing, invalid, or mismatched assets.
- All configured paths match the reachable assets exactly (no fixes required).
