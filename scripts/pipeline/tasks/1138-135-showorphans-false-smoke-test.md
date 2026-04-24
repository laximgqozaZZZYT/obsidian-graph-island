---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 135-e2e-smoke-fail
depends: none
summary: showOrphans=false smoke test失敗の根本原因調査
---

## Description (subtask of 135-e2e-smoke-fail)

e2e/smoke.spec.ts:149 の "3-Filter › showOrphans=false reduces nodes" テストを読み、
  期待する挙動と実際の挙動を確認する。
  - smoke.spec.ts:149-180 付近のassertion内容を確認
  - showOrphans=false 適用時のnode count変化の閾値/条件を確認
  - src/utils/graph-filter.ts の filterOrphans() ロジックを確認
  - getGraphData() パイプライン(GraphViewContainer.ts)でshowOrphans filterが正しい順序で呼ばれているか確認
  - CDP経由で実際にプラグインを動かし、showOrphans toggle前後のnode countをログ出力
  調査結果を investigation-notes として記録し、修正方針を決定する。
  ソースコードは修正せず、調査のみ実施。

## Acceptance criteria
- [x] 実装が完了し、テストが通ること
- [x] CLAUDE.md のルールに違反しないこと

## Investigation Notes (2026-04-25, CDP-verified)

### Test code (confirmed)
e2e/smoke.spec.ts:149-153
```ts
test("showOrphans=false reduces nodes", async () => {
  const count = await renderAndCount({ showOrphans: false });
  expect(count).toBeLessThan(BASELINE);
  await renderAndCount({ showOrphans: true });
});
```
BASELINE は line 45 で `await renderAndCount({ showOrphans: true })` から取得 (= getGraphData().nodes.length に統一済、過去 task 132 で修正反映)。

### filterOrphans() logic (src/utils/graph-filter.ts:14-21)
edges 配列に登場する全ノードIDを Set にし、その Set に含まれるノードのみを返す純粋関数。実装に問題なし。

### Pipeline order (src/views/GraphViewContainer.ts:6648-6692)
`getGraphData()` は次の順:
1. rawData 構築 (buildGraphFromVault)
2. `_filterLocalGraph` (localGraphCenter なら BFS)
3. `_filterNodeVisibility` →
   - `applyVisibilityFilters`: showOrphans → showAttachments → tag-node filter (has-tag edge を含む) → showSimilar → showNamedRelation
   - existingOnly
4. `_filterByQuery` (dataview/searchQuery)
5. excludeNodes / subgraph / degree / edge re-filter / mobile cap / group collapse

→ **showOrphans は has-tag edge 等の全 edge をまだ持つ段階で評価される** (MEMORY.md と一致)。順序問題なし。

### CDP 実測 (現在の vault: /home/ubuntu/obsidian-plugins/開発)

| Setting | nodes | edges | rawNodes | rawEdges | orphansOnRaw |
|---|---|---|---|---|---|
| showOrphans=true (BASELINE) | **2233** | 5558 | 2487 | 11074 | 23 |
| showOrphans=false | **2210** | 5558 | 2487 | 11074 | 23 |
| showOrphans=true (restore) | 2233 | 5558 | 2487 | 11074 | 23 |

rawEdgeTypes: link 1695 / semantic 2363 / tag 1500 / inheritance 100 / has-tag 5416

### Result
- `count(false) = 2210 < BASELINE = 2233` → **assertion 成立 (PASS)**
- showOrphans filter の差分は 23 nodes (~1%) — has-tag edge が ~5400 本あるためほぼ全ノードが接続扱い。生 orphan は 23 のみ。
- panel default は `tagDisplay="enclosure"` 等の影響で raw 2487 → visible 2233 (タグ・添付・similar フィルタ後)。
- 親 issue 135 が done になった理由と整合: 過去の修正で BASELINE 取得方法が `getGraphData().nodes.length` に統一済 (task 132)、graph-filter ロジックも妥当。

### Conclusion / 修正方針
**ソース修正不要**。コード/テストとも現状で正しい挙動を示す。task 1138 の根本原因調査は「現時点で再現せず・修正不要」が結論。

ただし潜在リスク:
- 差分 23 nodes は vault 内容依存。もし has-tag edge が全ノードを覆い真の orphan が 0 になった場合、`count == BASELINE` で fail する。これはテストの脆弱性 (vault 状態依存) であり、本タスクのスコープ外。必要なら別 issue として「smoke test の脆弱性: showOrphans の差分が 0 の vault で fail する」を立てて、合成 orphan ノードを noteFixture で挿入する等の改善が考えられる。

### 関連
- 親: 135-e2e-smoke-fail (done) — 過去サイクルで修正済
- 兄弟: 1139-135-showorphans-filter-e2e (done) — graph-filter 側の修正完了
- 兄弟: 1140-135-unit-test-e2e-smoke (done) — unit test と E2E 検証完了

ソースコードは未修正 (task 仕様遵守)。
