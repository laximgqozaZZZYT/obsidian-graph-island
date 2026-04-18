---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 712-699-639-626-subtask-issue-status-done-git-mv
depends: none
summary: 639-626 subtask issue を status:done 化して git mv でコミット
---

## Description (subtask of 712-699-639-626-subtask-issue-status-done-git-mv)

1. `Glob issues/pending/*639-626*subtask*.md` で対象ファイル特定。
     0件なら `Glob issues/done/*639-626*subtask*.md` で done 済みを確認し、該当すれば no-op で exit 0。
  2. Read で対象ファイルを確認し、Edit で frontmatter `status:` を `done` に書き換える。
     priority/reported/parent/depends/summary/source/本文は変更しない。
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行。
  4. `git status` を確認し、pending 削除 + done 追加 + status 変更のみであることを検証。
     他ファイルに差分があれば中止。
  5. `git add -A && git commit -m "chore: done <filename>"` でコミット（`<filename>` は拡張子なしベース名）。
  6. 検証: `git status` クリーン / `git log -1 --pretty=%s` が一致 / `ls issues/done/<filename>.md` 存在。
  制約: src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs 等は一切変更しない。
  God Object ファイル（GraphViewContainer.ts 等）には触れない。issues/ ディレクトリのみが対象。
  lint/test/build 実行不要。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
