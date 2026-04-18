---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 630-617-subtask
depends: none
summary: GraphViewContainer.ts の行数を計測し CLAUDE.md の GOD OBJECT 表を条件更新
---

## Description (subtask of 630-617-subtask)

1. `wc -l src/views/GraphViewContainer.ts` で現在の行数を取得する。
  2. 現在の行数が 8597 未満の場合のみ、`/home/ubuntu/obsidian-plugins/obsidian-graph-island/CLAUDE.md` の GOD OBJECT Policy 表の該当行を Edit tool で更新する:
     - 対象行: `| \`src/views/GraphViewContainer.ts\` | 8597 | 8597 | 1 — extract: snapshot, export, filter orchestration |`
     - 変更内容: 2列目 (Lines) と 3列目 (Max Allowed) を現在の行数に置き換え。4列目の Decomposition Priority 説明文は変更しない。
     - 他の god object 行 (`PanelBuilder.ts`, `EdgeRenderer.ts`, `RenderPipeline.ts`) は絶対に触らない。
  3. 現在の行数が 8597 以上の場合: 編集を一切行わずサブタスク終了 (no-op commit は作らない)。
  4. 変更があった場合のみ `git add CLAUDE.md && git commit` で単一コミットを作成する。
  制約:
  - CLAUDE.md の "Max Allowed" は ratchet down のみ (増加方向の更新は禁止)。8597 未満だった場合のみ更新。
  - テスト実行は不要 (ドキュメントのみの変更)。
  - GraphViewContainer.ts 本体には一切変更を加えない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
