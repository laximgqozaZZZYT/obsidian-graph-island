---
priority: high
reported: 2026-04-19
status: done
source: decomposed
parent: 1154-1149-getgraphdata-nodecount
depends: none
summary: getGraphData() パイプライン各段階の nodeCount を CDP eval で外部計測
---

## Description (subtask of 1154-1149-getgraphdata-nodecount)

`getGraphData()` の各フィルタ段階での nodeCount / edgeCount を、**プロダクションコードを変更せずに** CDP eval で外部から計測する。

理由:
- CLAUDE.md 「Forbidden Patterns」により `console.*` はプロダクションコード禁止 (esbuild drop は禁止理由ではなく但し書き)。
- `src/views/GraphViewContainer.ts` は 8580 行 = Max Allowed。God Object Policy の "ratchet down only" によりロジック密度を上げる変更も不可。

### 実装方針

1. `e2e/cdp-e2e-nodecount-trace.spec.ts` を新規作成 (E2E のみ、`src/` 変更なし)。
2. CDP 経由で以下を段階的に評価:
   - stage=rawData: `buildGraphFromVault()` の戻り値
   - stage=afterShowOrphans, afterExistingOnly, afterTagFilter, afterSearchQuery, afterGroupCollapse: 各フラグ単独適用時の `getGraphData()` 戻り値を比較
3. 各段階の `nodes.length` / `edges.length` を収集し、test console に `[nodecount-trace] stage=<name> nodes=<n> edges=<m>` を **テストコード側で** 出力 (プロダクションではない E2E コードなので console 可)。
4. 既存 CDP ヘルパー `e2e/helpers/cdp-helpers.ts` の `connectCDP` / `cdpEval` を使用。

### 検証

- [ ] `src/**` が 1 byte も変更されていない (`git diff --stat src/` が空)。
- [ ] `wc -l src/views/GraphViewContainer.ts` が 8580 以下 (不変)。
- [ ] `pnpm build` PASS、`pnpm lint` PASS。
- [ ] 新規 spec 実行で 6 段階すべての trace 行が出力される。
- [ ] ブランチ `investigate/139-1-nodecount-trace` に push 済み (main merge 不要、spec は永続化して OK)。

## Acceptance criteria

- [ ] `src/` 配下に変更がないこと (`git diff --stat src/` が空)。
- [ ] `e2e/cdp-e2e-nodecount-trace.spec.ts` が新規追加されており、6 段階 (rawData / afterShowOrphans / afterExistingOnly / afterTagFilter / afterSearchQuery / afterGroupCollapse) すべての `[nodecount-trace]` 行を stdout に出すこと。
- [ ] `pnpm build` / `pnpm lint` PASS。
- [ ] `GraphViewContainer.ts` の行数が 8580 以下であること。
- [ ] ブランチ `investigate/139-1-nodecount-trace` に push 済み。
- [ ] CLAUDE.md の Forbidden Patterns / God Object Policy に違反しないこと。
