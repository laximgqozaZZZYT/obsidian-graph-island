---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 703-694-subtask
depends: none
summary: GraphViewContainer.ts ratchet を単一コミットで実施
---

## Description (subtask of 703-694-subtask)

transactional 操作として1コミットに集約して実施する。分解禁止。

手順（すべて同一 claude -p セッション・同一コミット内で完結させること）:

1. `wc -l < src/views/GraphViewContainer.ts` で現在の行数 N を測定（`< file` 形式でファイル名を出力に含めない）
2. **CLAUDE.md の Max Allowed は決して増加させない**（Ratchet down only ポリシー）。
   - N > 8597 の場合: CLAUDE.md を触らず、先に `GraphViewContainer.ts` から snapshot/export/filter orchestration のいずれかを別ファイル（例: `src/views/snapshot.ts`）に抽出して 8597 以下に戻す
   - N ≤ 8597 の場合のみ: CLAUDE.md の GOD OBJECT Policy テーブルの `src/views/GraphViewContainer.ts` 行の Lines と Max Allowed を**両方とも** N に更新（Max Allowed は据え置かず、必ず N まで ratchet down する）
3. `pnpm test` / `pnpm lint` / `pnpm format:check` / `pnpm build` を実行し全 PASS を確認
4. bundle size budget 800KB を超えていないことを確認
5. 上記すべてを単一コミットで commit（CLAUDE.md 変更と src 変更が混在する場合も1コミットに集約）

## Acceptance criteria

- [ ] `wc -l < src/views/GraphViewContainer.ts` の出力（数値のみ）が CLAUDE.md の該当行の Lines 値と一致
- [ ] CLAUDE.md の Max Allowed == Lines（ratchet down 完了、測定値と等しい）
- [ ] CLAUDE.md の Max Allowed が 8597 から増加していない
- [ ] `pnpm test` / `pnpm lint` / `pnpm format:check` / `pnpm build` すべて PASS
- [ ] `main.js` のサイズが 800KB 以下
- [ ] 本タスクに対するコミット数 = 1
