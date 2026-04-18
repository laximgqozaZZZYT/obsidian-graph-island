---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1082-1063-issues-1014-993-subtask-md-status-done-a
depends: none
summary: issues/1014-993-subtask.md の status を done に遷移 + acceptance criteria チェック
---

## Description (subtask of 1082-1063-issues-1014-993-subtask-md-status-done-a)

対象ファイル: `issues/1014-993-subtask.md` の1ファイルのみ編集。

  変更内容:
  1. フロントマターの `status: in-progress` を `status: done` に書き換え
     - 他の frontmatter フィールド (priority/reported/source/parent/depends/summary) は一切変更しない
  2. Acceptance criteria セクション内の未チェック `- [ ]` を全て `- [x]` に変更
     - 典型的には以下の2項目:
       - `- [ ] 実装が完了し、テストが通ること` → `- [x] 実装が完了し、テストが通ること`
       - `- [ ] CLAUDE.md のルールに違反しないこと` → `- [x] CLAUDE.md のルールに違反しないこと`

  制約:
  - `git mv` 使用禁止 (ファイル名・パス変更不可)
  - `src/` 配下には一切触れない
  - 他の `issues/*.md` は変更しない
  - Edit ツールで old_string/new_string をピンポイント指定すること
  - `replace_all` 禁止 (Description セクションなど acceptance criteria 外の `- [ ]` を巻き込まないため)

  手順:
  1. `Read issues/1014-993-subtask.md` でファイル全体を確認
  2. `Edit` で frontmatter の `status: in-progress` → `status: done`
  3. `Edit` で acceptance criteria の2つの `- [ ]` を個別に `- [x]` に変更 (1回ずつ、old_stringに前後の文脈を含めて一意化)
  4. 検証:
     - `git diff --stat` → 変更ファイルが `issues/1014-993-subtask.md` 1件のみ
     - `grep '^status:' issues/1014-993-subtask.md` → `status: done` を返す
     - Acceptance criteria セクション内に未チェック `- [ ]` が残っていないことを Read で目視確認
  5. コミット: `chore: done 1014-993-subtask.md`
     - `pnpm test` / `pnpm lint` はスキップ可 (issues/ 配下ドキュメントのみ)
     - pre-commit hook は通す (`--no-verify` 禁止)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
