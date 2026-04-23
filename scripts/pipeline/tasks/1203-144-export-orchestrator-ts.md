---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 144-coverage-drop
depends: none
summary: export-orchestrator.ts の純関数部分に単体テスト追加
---

## Description (subtask of 144-coverage-drop)

src/views/export-orchestrator.ts (177行・未テスト) を Read で読んで、
  純関数または最小モックで叩ける関数を抽出してテスト化する。
  
  もし全関数が host 依存の場合は、tests/views/export-orchestrator-pure.test.ts で
  ExportOrchestratorHost / ExportConfig の最小モックを作り、エクスポート
  パイプラインの呼び出し順・分岐 (PNG/SVG/JSON) を vi.fn() トレースで検証する 6-8 件。
  
  注意: src/views/export-orchestrator.ts は変更しない (テストの追加のみ)。
  もし関数が `function` 宣言ではなく内部関数のみの場合は、
  公開関数に対する分岐テスト (format 引数違いで関数が分岐する) を追加。
  
  期待: 関数 ~3件 + statements ~80行カバー

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
