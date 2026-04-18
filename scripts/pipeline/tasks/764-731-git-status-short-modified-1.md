---
priority: high
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 731-717-read-git-status
depends: subtask-2
summary: git status --short で modified 1件のみ確認
---

## Description (subtask of 731-717-read-git-status)

Bash で `git status --short docs/issues/<対象ファイル>` を実行。
  出力が ` M docs/issues/<対象ファイル>` の1行のみであることを確認する
  (modified 状態、staged ではない)。
  他ファイルへの副作用がないことも `git status --short` 全体で確認。
  検証完了後、結果を報告して終了。add/commit/mv は絶対に実行しない。

`★ Insight ─────────────────────────────────────`
- subtask-1 (Read) と subtask-2 (git diff) は相補的: Read は最終状態、diff は変更差分を見る。両方やることで「status更新済み」かつ「他フィールド無傷」を二重保証
- subtask-3 の `git status --short` はステージング状態も含めて検出できるので、誤って add されていないことの最終ガード
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
