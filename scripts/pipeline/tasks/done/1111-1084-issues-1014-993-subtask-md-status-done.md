---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 1084-1064-issues-1014-993-subtask-md-status-done
depends: none
summary: issues/1014-993-subtask.md の status と全チェックボックスを done に更新し単独コミット
---

## Description (subtask of 1084-1064-issues-1014-993-subtask-md-status-done)

1. Read で `issues/1014-993-subtask.md` を読み込む
  2. Edit で frontmatter の `status: cancelled` を `status: done` に書き換え（1箇所、replace_all不要）
  3. Edit の replace_all=true で Acceptance criteria セクションの `- [ ]` を `- [x]` に全置換
  4. `git add issues/1014-993-subtask.md` のみステージ（他ファイル混入禁止）
  5. `git commit -m "chore: done 1014-993-subtask.md"` で単独コミット

  制約:
  - `git mv` 使用禁止（パス据え置き）
  - 他ファイル編集禁止
  - テスト・ビルド・デプロイ不要（ドキュメントのみ）
  - カバレッジ・バンドルサイズ確認不要

  完了判定:
  - frontmatter に `status: done` が存在
  - Acceptance criteria の全チェックボックスが `- [x]`
  - `git log -1` で該当コミットが HEAD に存在

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
