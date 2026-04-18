---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 723-712-639-626-subtask-issue-status-done-git-mv
depends: none
summary: 639-626 subtask issue を status:done にして git mv で単一コミット
---

## Description (subtask of 723-712-639-626-subtask-issue-status-done-git-mv)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイルを特定。
     - 0件なら Glob `issues/done/*639-626*subtask*.md` を確認。done に既にあれば no-op 終了 (exit 0)。
     - 複数件なら frontmatter summary が「subtask issueのstatusをdoneに更新しコミット」系のものを選択。曖昧なら中止してユーザーに報告。
  2. Read で対象ファイル全体を確認。
  3. Edit で frontmatter の `status: pending` または `status: in-progress` を `status: done` に変更。
     priority/reported/parent/depends/summary/source および本文は変更しない。
  4. `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行 (edit 済み状態で mv → rename 検出)。
  5. `git status` で差分が「pending 側 delete + done 側 add (rename) + status modify」のみであることを確認。他ファイル差分があれば即中止。
  6. `git add -A && git commit -m "chore: done <filename>"` (`<filename>` は拡張子なしベース名)。
  7. 検証:
     - `git status` がクリーン
     - `git log -1 --pretty=%s` が commit message と一致
     - `ls issues/done/<filename>.md` が存在
  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs は変更しない
  - lint/test/build 実行不要
  - God Object ファイルには触れない
  - 作業対象は issues/ ディレクトリのみ

`★ Insight ─────────────────────────────────────`
- この種の「書類仕事」系 issue は decompose してもオーバーヘッドが増えるだけで、単一セッション (max-turns 30) に十分収まる
- 分解禁止の判定基準：ステップ間に検証ゲートが不要で、全体を1コミットにまとめるのが妥当なもの
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
