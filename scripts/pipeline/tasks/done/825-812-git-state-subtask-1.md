---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 812-802-repository-state
depends: 811-802-subtask-1 (/tmp/git-status-short.txt が存在すること)
summary: git state が subtask-1 取得時から未変更であることを検証
---

## Description (subtask of 812-802-repository-state)

/home/ubuntu/obsidian-plugins/obsidian-graph-island にて read-only 検証を実行:

  1. `git diff --quiet && git diff --cached --quiet; echo "CLEAN=$?"` を実行し CLEAN=0 を期待
     - working tree と index の両方に変更がないことを確認
  2. `git status --short | diff - /tmp/git-status-short.txt; echo "MATCH=$?"` を実行し MATCH=0 を期待
     - subtask-1 取得時点と同一の untracked/modified ファイルリストが維持されていることを確認
  3. 結果報告:
     - 両方成功 (CLEAN=0 かつ MATCH=0): "state 未変更契約 OK" を報告して完了
     - いずれか失敗: diff 内容を含めてエラー報告して終了 (復旧は行わず、ユーザー判断に委ねる)

  制約:
  - ファイル変更なし (read-only)
  - コミットなし
  - god object / coverage ルール N/A (コード変更なし)
  - CLAUDE.md Forbidden Patterns 抵触なし

  Acceptance:
  - [ ] CLEAN=0 が報告される
  - [ ] MATCH=0 が報告される
  - [ ] /tmp/git-status-short.txt は削除せず温存 (後続パイプラインが参照する可能性)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
