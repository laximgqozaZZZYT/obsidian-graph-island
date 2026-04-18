---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 762-731-edit-read-status-done
depends: subtask-1
summary: 対象ファイル再Read + frontmatter/本文保全検証
---

## Description (subtask of 762-731-edit-read-status-done)

subtask-1 で特定したファイルパスを Read ツールで読み込み、以下を検証:
  1. frontmatter に `status: done` が存在すること
  2. 他の frontmatter フィールド (priority, reported, summary, source, parent, depends)
     が元の値から改変されていないこと
  3. `## Description` 以下の本文が完全に保全されていること (改行・インデント含む)
  4. YAML 区切り `---` が壊れていないこと
  検証結果を以下の形式でレポート出力:
  ```
  PASS/FAIL: status field
  PASS/FAIL: other frontmatter fields
  PASS/FAIL: body content
  PASS/FAIL: YAML delimiters
  ```
  全て PASS なら acceptance criteria 満足。ファイル変更・コミットは一切行わない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
