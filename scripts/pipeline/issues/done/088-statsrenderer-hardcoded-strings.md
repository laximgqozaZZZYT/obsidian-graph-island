---
priority: high
reported: 2026-04-11
status: done
source: kaizen
summary: StatsRenderer/SnapshotManager にハードコード英語文字列（i18n t() 未使用）
---
## Description

`src/views/StatsRenderer.ts` と `src/views/SnapshotManager.ts` に
ユーザー向け英語文字列が `t()` 関数を経由せず直接ハードコードされている。
CLAUDE.md 規約「All user-facing strings through `src/i18n.ts` `t()` function」に違反。

**該当箇所:**
- `src/views/StatsRenderer.ts:101` — `"High overlap — try increasing node spacing or enabling auto-optimize"`
- `src/views/StatsRenderer.ts:159` — `` `degree ${d}${d === 20 ? "+" : ""}: ${count} nodes — click to filter` ``
- `src/views/SnapshotManager.ts:215` — `` `${entry.name}: ${entry.nodeCount}n, ${entry.edgeCount}e — Shift+click to compare two` ``

これらはすべてユーザーが直接目にする tooltip テキストであり、
国際化対応が必要。同ファイル内の他のテキストは `t()` を使っており一貫性に欠ける。

## Acceptance criteria
- [ ] `src/i18n.ts` に対応する i18n キーを追加する（例: `stats.overlapTip`, `stats.degreeTip`, `snapshot.compareTip`）
- [ ] 上記 3 箇所で `t()` 関数を使用するよう修正する
- [ ] 動的パラメータは `t().replace()` パターンで置換する
