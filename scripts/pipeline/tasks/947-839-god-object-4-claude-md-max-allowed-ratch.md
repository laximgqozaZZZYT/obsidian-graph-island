---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 839-726-subtask
depends: none
summary: God Object 4ファイルのライン数測定とCLAUDE.md Max Allowedを現値にratchet更新、単一コミットでクローズ
---

## Description (subtask of 839-726-subtask)

1. `wc -l` で 4 ファイルの現在行数を測定:
     - src/views/GraphViewContainer.ts
     - src/views/PanelBuilder.ts
     - src/views/EdgeRenderer.ts
     - src/views/RenderPipeline.ts
  2. CLAUDE.md の GOD OBJECT Policy テーブルの `Lines` と `Max Allowed` を測定値に更新（ratchet down のみ、増加は禁止）。
  3. いずれかのファイルが前回 Max Allowed を超えていた場合は fail とし、超過分の抽出提案をコメントで description に残す（コード変更はしない）。
  4. 変更は CLAUDE.md のみに限定。src/ 配下のコードは一切触らない。
  5. 単一コミットで完了: `chore: ratchet GOD OBJECT line counts (2026-04-19)`。
  6. テスト実行は不要（CLAUDE.md のみ変更のため）。`pnpm lint` と `pnpm format:check` のみ実行して通ることを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
