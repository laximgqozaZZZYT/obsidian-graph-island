---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 678-664-639-626-subtask-issue-status-done-git-mv
depends: none
summary: 639-626 subtask issue を status:done 化して git mv でコミット
---

## Description (subtask of 678-664-639-626-subtask-issue-status-done-git-mv)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイル特定。
     frontmatter summary が「subtask issueのstatusをdoneに更新しコミット」のもの。
     0件なら Glob `issues/done/*639-626*subtask*.md` を確認。done 済みなら no-op 終了 (exit 0)。
  2. Read で対象ファイル全体確認。Edit で frontmatter `status: pending` または `status: in-progress` を `status: done` に書き換え。
     他フィールド (priority/reported/parent/depends/summary/source) と本文は一切変更しない。
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md` 実行。
  4. `git status` で「pending delete + done add + status modify のみ」であることを確認 (他ファイルの差分があれば中止)。
  5. `git add -A && git commit -m "chore: done <filename> — GVC test report appended"` でコミット。`<filename>` は拡張子なしベース名。
  6. src/**, tests/**, 設定ファイル (package.json, vitest.config.ts, esbuild.config.mjs 等) は一切変更しない。lint/test/build は実行不要。
  7. 検証: `git status` クリーン / `git log -1 --pretty=%s` が commit message と一致 / `ls issues/done/<filename>.md` 存在確認。

`★ Insight ─────────────────────────────────────`
- `issues/pending/` → `issues/done/` の移動は、自律パイプライン (project_autonomous_pipeline.md 参照) の完了シグナルとして機能しています — status frontmatter と物理ディレクトリの両方を揃えることで、次サイクルが重複処理しない冪等性を確保
- `git mv` は `git rm + git add` の atomic 版。`git status` で rename として認識されれば diff が最小化され、レビュー性が上がります
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
