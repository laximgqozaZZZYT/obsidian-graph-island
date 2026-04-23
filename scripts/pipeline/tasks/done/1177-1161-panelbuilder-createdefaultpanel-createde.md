---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 1161-140-panelbuilder-createdefaultpanel-179
depends: subtask-1
summary: PanelBuilder.createDefaultPanel を createDefaultPanelState 呼び出しに縮小
---

## Description (subtask of 1161-140-panelbuilder-createdefaultpanel-179)

src/views/PanelBuilder.ts:398-577 の createDefaultPanel (179行) を、
  panel-defaults.ts の createDefaultPanelState() を呼ぶだけの 20行以下のラッパーに縮小する。
  - import { createDefaultPanelState } from "./panel-defaults" を追加
  - 関数本体は return createDefaultPanelState() のみ (必要なら Obsidian 依存の後処理だけ残す)
  - CLAUDE.md の GOD OBJECT Policy により PanelBuilder.ts の総行数を必ず減らすこと
    (Max Allowed 2216 を超えない、かつ差分は必ずマイナス)
  - pnpm build と pnpm test が通ることを確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
