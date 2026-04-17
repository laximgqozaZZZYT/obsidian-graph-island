---
priority: high
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 501-491-
depends: none
summary: GraphViewContainer.ts 行数を計測しverifyコミットを作成
---

## Description (subtask of 501-491-)

以下のコマンドを実行して行数を計測:
    wc -l src/views/GraphViewContainer.ts
  実測値は 8597 行 (CLAUDE.md 上限 8597、親issue基準 8612 の両方を満たす)。

  変更ファイルは不要。空コミット (--allow-empty) で以下のメッセージを作成:
    chore: verify GraphViewContainer.ts ≤ 8612 (actual: 8597 lines)

    - 親issue 491-483 のsubtask (行数計測と上限判定)
    - CLAUDE.md GOD OBJECT Policy 上限 8597 以下を維持
    - 追加の分解タスク不要

  受け入れ条件:
  - [ ] wc -l の出力が 8612 以下であることを確認
  - [ ] 空コミットがmainブランチ or 作業ブランチに記録される
  - [ ] pnpm test / pnpm lint は変更なしのため再実行不要 (コード未変更)

  注意:
  - src/views/GraphViewContainer.ts は編集しない (GOD OBJECT Policy準拠)
  - CLAUDE.md の "Max Allowed" は現行値でラチェット運用のため、8597 を超過したら別subtaskで分解作業を起票する必要があるが、今回は該当せず

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
