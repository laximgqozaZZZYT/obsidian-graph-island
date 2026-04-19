---
priority: medium
reported: 2026-04-19
status: done
source: decomposed
parent: 134-dead-exports
depends: subtask-2, subtask-3
summary: dead-export件数の自動計測スクリプトをCI/gateに組み込む
---

## Description (subtask of 134-dead-exports)

scripts/check-dead-exports.mjs を作成。knip実行 → dead exports 件数を出力し、
  しきい値 (50) を超えたら exit 1。package.json の scripts に
  `"check:dead-exports": "node scripts/check-dead-exports.mjs"` を追加。
  現在値を subtask-2,3 完了後の実測値で記録 (例: 48)。コメントで「Ratchet down only」を明示。
  将来のリグレッション検出用。bundle size budget と同様の運用。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
