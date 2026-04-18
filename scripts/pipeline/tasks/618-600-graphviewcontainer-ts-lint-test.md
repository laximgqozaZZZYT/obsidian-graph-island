---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 600-590-graphviewcontainer-ts-8597
depends: none
summary: GraphViewContainer.ts 行数検証と lint/test グリーン確認
---

## Description (subtask of 600-590-graphviewcontainer-ts-8597)

検証のみ、コード変更なし。
  1. `wc -l src/views/GraphViewContainer.ts` で行数を取得し、変数 NNNN に記録
  2. `Read` で CLAUDE.md の GOD OBJECT Policy 表を読み、GraphViewContainer.ts の Max Allowed=8597 を確認
  3. NNNN <= 8597 を検証。超過していたら即座に停止し、超過分と抽出候補 (snapshot/export/filter 関連メソッド) を標準出力に記録して失敗終了
  4. `pnpm lint` を実行しグリーン確認
  5. `pnpm test` を実行しグリーン確認 (既存 2570+ PASS 維持)
  6. GraphViewContainer.ts と CLAUDE.md の Max Allowed には一切編集を加えない
  受け入れ条件:
  - wc -l 出力が 8597 以下
  - pnpm lint / pnpm test がグリーン
  - ファイル変更なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
