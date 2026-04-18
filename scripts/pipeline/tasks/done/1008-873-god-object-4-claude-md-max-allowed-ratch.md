---
priority: medium
reported: 2026-04-19
status: done
source: decomposed
parent: 873-749-subtask
depends: none
summary: God Object 4ファイルを実測し CLAUDE.md の Max Allowed をratchet down
---

## Description (subtask of 873-749-subtask)

手順(単一コミットで完結):
  1. `wc -l` で4ファイルの現在行数を測定
     - src/views/GraphViewContainer.ts
     - src/views/PanelBuilder.ts
     - src/views/EdgeRenderer.ts
     - src/views/RenderPipeline.ts
  2. CLAUDE.md の GOD OBJECT Policy 表を開き、各行の「Lines」と「Max Allowed」を実測値で更新
     - 実測値 < 現在のMax Allowed → 両方を実測値に更新(ratchet down)
     - 実測値 == 現在のMax Allowed → 変更不要
     - 実測値 > 現在のMax Allowed → ポリシー違反なので **報告のみ、更新しない**
  3. 変更が発生した場合のみ、`pnpm lint` と `pnpm test` が通ることを確認
  4. 1コミットにまとめる: `chore: ratchet down God Object Max Allowed to measured values (YYYY-MM-DD)`
  
  Acceptance:
  - CLAUDE.md の Max Allowed が実測値以下になっている(ratchetポリシー準拠)
  - ソースコード本体は変更しない(測定とドキュメント更新のみ)
  - 既存テストが引き続きPASSする

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
