---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 536-523-subtask
depends: none
summary: GraphViewContainer.ts の行数を検証し空コミットで記録
---

## Description (subtask of 536-523-subtask)

祖先タスク 518-501-graphviewcontainer-ts-verify の verify 作業を完遂する。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` を実行し、出力が 8612 以下であることを確認する (実測値: 8597 行)
  2. `git commit --allow-empty` で以下のメッセージで空コミットを作成する:
     ```
     chore: verify GraphViewContainer.ts ≤ 8612 (actual: 8597 lines)

     - 親issue 518-501-graphviewcontainer-ts-verify の subtask chain (523-518 → 本タスク) を閉じる
     - CLAUDE.md GOD OBJECT Policy 上限 8597 以下を維持 (ratchet 準拠)
     - コード未変更のため pnpm test / pnpm lint は再実行不要
     ```

  制約:
  - `src/views/GraphViewContainer.ts` は **絶対に編集しない** (CLAUDE.md GOD OBJECT Policy)
  - 他ファイルも一切変更しない (verify-only タスク)
  - 行数が 8597 を超過していた場合は本タスクを実行せず、別途分解タスクを起票するようパイプラインに報告する (想定外ケース)

  受け入れ条件:
  - [ ] `wc -l` の出力が 8612 以下
  - [ ] 空コミットが現ブランチ (fix/autofit-suppress-order) に記録される
  - [ ] CLAUDE.md のルールに違反しない (コード変更ゼロのため自動的に満たされる)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
