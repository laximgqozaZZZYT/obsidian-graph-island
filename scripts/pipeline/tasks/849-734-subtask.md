---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 734-721-subtask
depends: none
summary: subtask
---

## Description (subtask of 734-721-subtask)

で特定したファイルに対し、以下を grep / Read で検証:
  - `console.*` がプロダクションコードに残っていないか
  - `location.reload()` を使用していないか
  - ハードコードされた閾値 (RenderThresholds 経由でない数値) がないか
  - God Object 4ファイルが Max Allowed を超えていないか (wc -l で確認)
  違反があれば issue 形式で報告。違反なければ PASS ログを残す。コード変更なし。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
