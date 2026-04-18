---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 721-702-subtask
depends: subtask-1
summary: priority/reported/parent/depends/summary/source フィールド保持を検証
---

## Description (subtask of 721-702-subtask)

subtask-1 で取得した frontmatter において、以下フィールドが編集前から保持されていることを確認:
  - priority
  - reported
  - parent
  - depends
  - summary
  - source
  各フィールドの存在 (Grep で `^<field>:` を検索) と値が非空であることを確認。
  git show HEAD~1:<file> と比較して値が変化していないことを確認 (status 以外は不変であるべき)。
  失敗時は `git diff HEAD~1 HEAD -- <file>` の出力を添えて報告する。
  Acceptance:
  - 6フィールドすべて存在かつ値が編集前と一致 → PASS
  - いずれか変化していれば FAIL として差分報告

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
