---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1063-1048-issues-1014-993-subtask-md-status-done
depends: none
summary: issues/1014-993-subtask.md の status を done に遷移 + acceptance criteria チェック
---

## Description (subtask of 1063-1048-issues-1014-993-subtask-md-status-done)

対象ファイル: `issues/1014-993-subtask.md` の1ファイルのみ編集。

  変更内容:
  1. フロントマターの `status: in-progress` を `status: done` に書き換え
     - 他の frontmatter フィールド (priority/reported/source/parent/depends/summary) は一切変更しない
  2. Acceptance criteria セクション内の未チェック `- [ ]` を全て `- [x]` に変更
     - 典型的には `- [ ] 実装が完了し、テストが通ること` と `- [ ] CLAUDE.md のルールに違反しないこと` の2項目

  制約:
  - `git mv` 使用禁止 (ファイル名・パス変更不可)
  - `src/` 配下には一切触れない
  - 他の `issues/*.md` は変更しない
  - Edit ツールで old_string/new_string をピンポイント指定すること (replace_all で他セクションの `- [ ]` まで巻き込まない)

  検証手順 (実行してコミット前に確認):
  - `git diff --stat` → 変更ファイルが `issues/1014-993-subtask.md` 1件のみ
  - `grep '^status:' issues/1014-993-subtask.md` → `status: done` を返す
  - Acceptance criteria セクション内に未チェック `- [ ]` が残っていないこと (ファイル末尾付近の該当セクションを Read で目視確認)

  コミット:
  - メッセージ: `chore: done 1014-993-subtask.md`
  - `pnpm test` / `pnpm lint` はスキップ可 (issues/ 配下ドキュメントのみ変更のため)
  - pre-commit hook で lint が走る場合は通す (--no-verify 禁止)

`★ Insight ─────────────────────────────────────`
- このタスクを敢えて分割 (例: status 変更 / checkbox 変更 / commit の3段) するとコミット粒度が不自然に細かくなり、`git log` 可読性も落ちる。自律パイプラインの定型処理は「1 subtask = 1 commit」が最も扱いやすい
- `replace_all` を使わず Edit で個別指定する理由: `## Description` セクションなど acceptance criteria 外にも `- [ ]` が含まれうるため、意図しない箇所まで置換すると issue 本文の意味が変わる
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
