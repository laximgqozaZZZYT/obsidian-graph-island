---
priority: high
reported: 2026-04-19
status: done
source: decomposed
parent: 849-734-subtask
depends: none
summary: `location.reload()` 使用有無を検証
---

## Description (subtask of 849-734-subtask)

`src/` 配下で `location\.reload` を Grep で検索 (正規表現)。
  検出時は `file:line` 形式でリスト化し issue 形式で報告。CLAUDE.md の禁止パターンに従い、代替手段 (`disablePlugin/enablePlugin`) を推奨コメントとして issue に記載。
  0件なら `PASS: location.reload() 未検出` をログ出力。コード変更なし。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
