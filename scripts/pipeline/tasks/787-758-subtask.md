---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 758-730-status-done-edit
depends: none
summary: subtask
---

## Description (subtask of 758-730-status-done-edit)

`★ Insight ─────────────────────────────────────`
- 元issueは既に subtask (親チェーン内) であり、操作粒度は「Edit 1回〜数回」レベル。過剰分解は pipeline のオーバーヘッドを増やすだけなので、2タスクに抑える
- `status: decomposed` → `status: done` のような frontmatter 書き換えは、`old_string` に周囲行を含めて一意性を担保するのが鉄則。単独行では複数ファイルで衝突する
- 依存チェーン: 本 issue は parent の subtask-1 (調査) の出力に依存。subtask-1 の成果物が pipeline 入力として渡ってくる前提で書く
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
