---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 566-562-subtask
depends: none
summary: GraphViewContainer.ts の行数ラチェット監査 (verify-only)
---

## Description (subtask of 566-562-subtask)

元issueが「分解せず1サブタスクとして出力」と明示しているため、これ以上の分解は行わない。
  CLAUDE.md の GOD OBJECT ポリシー (GraphViewContainer.ts Max Allowed: 8597行) に対する
  verify-only 監査タスクとして実行する。

  作業内容:
  1. `wc -l src/views/GraphViewContainer.ts` で現在行数を確認
  2. CLAUDE.md の "Max Allowed" 値 (8597) と比較し、超過していないか検証
  3. `pnpm test` を実行しユニットテストがPASSすることを確認
  4. `pnpm lint` を実行しlintエラーがないことを確認
  5. `pnpm format:check` でフォーマット準拠を確認

  変更:
  - コード変更は原則なし (verify-only)
  - もし行数が 8597 を超えていた場合のみ、超過分の抽出候補 (snapshot/export/filter orchestration) を
    report としてコミットメッセージに記載 (実際の抽出は行わず、親タスクに差し戻し)
  - テスト・lint・formatがすべてグリーンであることを verify

  受入条件:
  - GraphViewContainer.ts の行数 ≤ 8597 (ラチェット維持)
  - `pnpm test` / `pnpm lint` / `pnpm format:check` が全てPASS
  - CLAUDE.md のGOD OBJECTポリシーに違反しない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
