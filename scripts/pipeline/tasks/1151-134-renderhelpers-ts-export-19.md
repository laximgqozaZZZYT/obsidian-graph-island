---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 134-dead-exports
depends: none
summary: `RenderHelpers.ts` の未使用 export を削除 (19個)
---

## Description (subtask of 134-dead-exports)

`src/views/RenderHelpers.ts` の 19個の未参照 export を対象に同手順で削除。
  1. `ts-prune | grep RenderHelpers.ts` で対象列挙
  2. `grep -rn --include="*.ts" "<NAME>" src/ tests/` で最終確認
  3. 内部でのみ使うものは `export` だけ外す (関数本体は残す)
  4. テストから参照されている場合はテストもクリーンアップ
  5. `pnpm build && pnpm test && pnpm lint` グリーン維持

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
