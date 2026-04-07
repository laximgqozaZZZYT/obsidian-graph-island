---
priority: medium
reported: 2026-04-07
status: done
source: decomposed
parent: 028-inline-relation-syntax
depends: subtask-2
summary: パネルUI トグル + i18n + presets対応
---

## Description (subtask of 028-inline-relation-syntax)

1. i18n.ts:
     - "showNamedRelations" ラベル追加 (日本語: "名前付き関係", 英語: "Named Relations")
  2. PanelBuilder / panel-sections:
     - 既存の showLinks / showSemanticEdges 等と同じUI流儀で
       showNamedRelations トグルを edge visibility セクションに追加
     - God Object (PanelBuilder 4377行) を超えないこと。
       既存の panel-sections-*.ts に追加できるならそちらへ
  3. presets.ts:
     - PRESET_KEYS に "showNamedRelations" を追加
     - 既存プリセット移行は不要（新フィールドは undefined → デフォルト true として扱う）
```

###

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
