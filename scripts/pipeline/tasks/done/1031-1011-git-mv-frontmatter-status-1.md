---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1011-990-subtask
depends: none
summary: git mv + frontmatter status更新 + 1コミット
---

## Description (subtask of 1011-990-subtask)

このissueは既に原子的な単一操作です。以下を1セッションで実行:
  1. 親issue (990-866-issue-pending-done-git-mv-status-done) で指定された対象ファイルを `git mv` で pending → done ディレクトリへ移動
  2. frontmatter の `status:` を1行だけ該当する値へ変更
  3. 上記2つをまとめて1コミット
  - CLAUDE.md のルール (God Object 非肥大化・ハードコード禁止・coverageしきい値維持) に違反しないこと
  - テストが通ること (`pnpm test`)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
