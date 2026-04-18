---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 590-577-graphviewcontainer-ts-8597
depends: none
summary: GraphViewContainer.ts 行数が 8597 以下であることを検証し空コミット
---

## Description (subtask of 590-577-graphviewcontainer-ts-8597)

検証のみ、コード変更なし。以下を順に実行:

  1. `wc -l src/views/GraphViewContainer.ts` で現在行数を取得
  2. CLAUDE.md の GOD OBJECT Policy 表を `Read` で確認し、GraphViewContainer.ts の Max Allowed=8597 と比較
  3. 現在行数 <= 8597 を確認。超過していたら即座に停止し、超過分と抽出候補(snapshot/export/filter 関連メソッド)を標準出力に記録して失敗終了
  4. `pnpm lint` がグリーンであることを確認
  5. `pnpm test` がグリーンであることを確認 (既存 2570+ PASS を維持)
  6. 変更が無いので `git commit --allow-empty -m "chore: verify GraphViewContainer.ts within GOD OBJECT limit (NNNN/8597 lines)"` で空コミット作成 (NNNN は実測値)

  受け入れ条件:
  - wc -l 出力が 8597 以下
  - pnpm lint / pnpm test がグリーン
  - CLAUDE.md の Max Allowed は変更しない (ratchet down only ポリシー遵守)
  - GraphViewContainer.ts に一切の編集を加えない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
