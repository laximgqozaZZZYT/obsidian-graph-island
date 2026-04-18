---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 988-928-639-626-subtask-issue-pending-done-git-m
depends: none
summary: 639-626 subtask issue を pending→done へ原子的に git mv + status 書換 + 単一コミット
---

## Description (subtask of 988-928-639-626-subtask-issue-pending-done-git-m)

1. `Glob issues/pending/*639-626*subtask*.md` で対象を特定
     - 0件: `Glob issues/done/*639-626*subtask*.md` で確認、該当あれば no-op exit 0
     - 複数件: 中止してユーザー報告
  2. Read で対象ファイルを開き、Edit で `status:` 行 (pending または in-progress) のみ `status: done` に置換。他 frontmatter / Description 本文は不変
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md`
  4. `git status` で差分検証 (pending削除 / done追加 / status 1行のみ)。他ファイル差分あれば中止
  5. `git add -A && git commit -m "chore: done <filename>"` (拡張子なしベース名)
  6. 検証: `git status` clean / `git log -1 --pretty=%s` 一致 / `ls issues/done/<filename>.md` 存在
  
  制約: src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs は触らない。God Object 禁止。issues/ 配下のみ。lint/test/build 不要。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
