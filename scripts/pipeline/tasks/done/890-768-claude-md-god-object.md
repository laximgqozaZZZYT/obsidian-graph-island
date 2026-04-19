---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 768-760-subtask
depends: subtask-1
summary: CLAUDE.md 違反/GOD OBJECT 肥大の有無を判定
---

## Description (subtask of 768-760-subtask)

subtask-1 で収集したファイル一覧に対して、以下を検証してレポートする:
  - GOD OBJECT 4ファイル (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) が
    変更リストに含まれる場合、`wc -l` で現在行数を確認し CLAUDE.md の Max Allowed を超えていないか判定
  - console.* / location.reload() 等の禁止パターンを Grep で検出
  判定結果を tasks/760-730-git-status-short-modified.md に追記する。コード修正はしない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
