---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 751-712-subtask
depends: none
summary: subtask
---

## Description (subtask of 751-712-subtask)

`★ Insight ─────────────────────────────────────`
- 元issueの description に既に明記されている通り、これは `git mv` + frontmatter書き換え + commit の原子的操作であり、これ以上の分解は価値を生まない
- 無理に分解すると: (1) 依存チェーンが長くなり自律パイプラインが停滞、(2) 中間状態（ファイル移動後・frontmatter未更新）でコミットが走るリスクが生じる
- 親タスク名 `712-699-639-626-subtask-issue-status-done-git-mv` から、status=done の issue ファイルを適切なディレクトリへ `git mv` する定型作業と推定
`─────────────────────────────────────────────────`

以下、**最小構成の1タスク**として出力します（原子性を保つため分解しません）。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
