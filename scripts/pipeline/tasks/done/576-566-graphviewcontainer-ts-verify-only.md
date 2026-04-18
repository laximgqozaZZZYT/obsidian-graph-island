---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 566-562-subtask
depends: none
summary: GraphViewContainer.ts の行数ラチェット監査 (verify-only)
---

## Description (subtask of 566-562-subtask)

元issueが「分解せず1サブタスクとして出力」と明示しているため、これ以上の分解は行わない。
CLAUDE.md の GOD OBJECT ポリシー (GraphViewContainer.ts Max Allowed: 8597行) に対する
verify-only 監査タスクとして実行する。

GraphViewContainer.ts は現在ちょうど 8597 行で上限値と一致しており、
hook や formatter による自動書き換えで 1 行でも増えれば即違反となる境界値状態にある。
そのため verify 前に対象ファイルが未変更であることを確認してから計測する。

作業内容:
1. `git diff --stat src/views/GraphViewContainer.ts` で対象ファイルが未変更であることを確認
2. `wc -l src/views/GraphViewContainer.ts` で現在行数を確認
3. CLAUDE.md の "Max Allowed" 値 (8597) と比較し、超過していないか検証
4. `pnpm test` を実行しユニットテストがPASSすることを確認
5. `pnpm lint` を実行しlintエラーがないことを確認
6. `pnpm format:check` でフォーマット準拠を確認

変更:
- コード変更は原則なし (verify-only)
- もし行数が 8597 を超えていた場合のみ、超過分の抽出候補 (snapshot/export/filter orchestration) を
  report としてコミットメッセージに記載 (実際の抽出は行わず、親タスクに差し戻し)

## Acceptance criteria
- [ ] `src/views/GraphViewContainer.ts` の行数が 8597 以下 (ラチェット維持)
- [ ] `pnpm test` がPASS
- [ ] `pnpm lint` がPASS
- [ ] `pnpm format:check` がPASS
- [ ] CLAUDE.md のGOD OBJECTポリシーに違反しない
