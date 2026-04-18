---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 598-582-pnpm-lint-pnpm-format-check
depends: subtask-2
summary: 検証サマリを親issueに追記しstatus更新
---

## Description (subtask of 598-582-pnpm-lint-pnpm-format-check)

subtask-1 / subtask-2 のレポートを統合し、親issueの本文末尾に
  「## Verification Result (2026-04-18)」セクションを追加。
  - lint: PASS/FAIL (件数)
  - format:check: PASS/FAIL (件数)
  - 両方PASSなら frontmatter `status: in-progress` → `status: completed`
  - いずれかFAILなら `status: blocked` にして違反概要を記載
  コード・設定ファイルは一切変更しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
