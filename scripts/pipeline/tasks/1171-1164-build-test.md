---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 1164-1158-panelbuilder-buildnodestab-4
depends: subtask-2
summary: build/test 実行し削減後の検証
---

## Description (subtask of 1164-1158-panelbuilder-buildnodestab-4)

pnpm build が成功しバンドルサイズが 800KB budget 内に収まることを確認。
  pnpm test を実行し、既存の PanelBuilder 関連ユニットテストが全件 PASS することを確認。
  失敗するテストがあれば、ctx の handlers bind 漏れ / 呼び出し順序ずれを疑い修正。
  pnpm lint && pnpm format:check が通ることも確認。
  wc -l src/views/PanelBuilder.ts で Max Allowed (2216) 以内であることを最終確認。
  実装変更は subtask-2 に起因する軽微な修正 (binding, 未使用 import 削除等) のみ。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
