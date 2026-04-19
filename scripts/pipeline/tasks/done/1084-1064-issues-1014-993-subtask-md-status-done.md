---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1064-1048-issues-1014-993-subtask-md-done
depends: none
summary: issues/1014-993-subtask.md のstatusとチェックボックスをdoneに更新しコミット
---

## Description (subtask of 1064-1048-issues-1014-993-subtask-md-done)

`issues/1014-993-subtask.md` の1ファイルのみを編集する。

  手順:
  1. Read で `issues/1014-993-subtask.md` を読み込む
  2. Edit で frontmatter の `status: decomposed` を `status: done` に書き換え (1箇所のみ、replace_all不要)
  3. Edit の replace_all=true で Acceptance criteria セクションの `- [ ]` を `- [x]` に全置換
  4. `git add issues/1014-993-subtask.md` でステージ (他ファイル混入禁止)
  5. `git commit -m "chore: done 1014-993-subtask.md"` で単独コミット

  制約:
  - `git mv` は使わない (パス据え置き)
  - 他ファイルを編集しない
  - テスト・ビルド・デプロイ不要 (ドキュメント変更のみ)
  - CLAUDE.md の品質ゲートに影響しないのでカバレッジ・バンドルサイズ確認は不要

  完了判定:
  - frontmatter に `status: done` が存在
  - Acceptance criteria の全チェックボックスが `- [x]`
  - `git log -1` で該当コミットが HEAD に存在

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
