---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 703-694-subtask
depends: none
summary: GraphViewContainer.ts ratchet を単一コミットで実施
---

## Description (subtask of 703-694-subtask)

transactional 操作として1コミットに集約して実施する。分解禁止。

  手順（すべて同一 claude -p セッション・同一コミット内で完結させること）:
  1. `wc -l src/views/GraphViewContainer.ts` で現在の行数を測定
  2. CLAUDE.md の GOD OBJECT Policy テーブルにある `src/views/GraphViewContainer.ts` 行の「Lines」列と「Max Allowed」列を測定値に更新（現状 8597/8597）。Ratchet down only ポリシーに従い、測定値 > 8597 の場合は CLAUDE.md を更新せず、代わりに `GraphViewContainer.ts` から snapshot/export/filter orchestration のいずれかを別ファイル（例: `src/views/snapshot.ts` など）に抽出して 8597 以下に戻すこと
  3. `pnpm test` / `pnpm lint` / `pnpm format:check` / `pnpm build` を実行し全 PASS を確認
  4. bundle size budget 800KB を超えていないことを確認
  5. 上記すべてを単一コミットで commit（CLAUDE.md 変更と src 変更が混在する場合も1コミットに集約）

  受け入れ基準:
  - CLAUDE.md の Lines/Max Allowed が実測値と一致
  - Max Allowed は現状値 8597 から増加していない
  - すべての quality gate が PASS
  - コミットが1つのみ

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
