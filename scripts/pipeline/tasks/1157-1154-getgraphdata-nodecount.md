---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 1154-1149-getgraphdata-nodecount
depends: none
summary: getGraphData() にパイプライン各段階の nodeCount トレースログを挿入
---

## Description (subtask of 1154-1149-getgraphdata-nodecount)

ブランチ `investigate/139-1-nodecount-trace` を作成し、`src/views/GraphViewContainer.ts` の `getGraphData()` 内で以下6段階の直後に `console.debug('[nodecount-trace] stage=<name> nodes=<n> edges=<m>')` を挿入する:
    1. rawData 取得直後 (stage=rawData)
    2. showOrphans フィルタ後 (stage=afterShowOrphans)
    3. existingOnly フィルタ後 (stage=afterExistingOnly)
    4. includeTagsInData/showTagNodes tag フィルタ後 (stage=afterTagFilter)
    5. searchQuery フィルタ後 (stage=afterSearchQuery)
    6. groupBy collapse 処理後 (stage=afterGroupCollapse)

  制約:
    - 追加行は合計10行未満。GraphViewContainer.ts の行数が 8580 を超えないこと (超える場合は既存の空行を詰める等で吸収)。
    - `console.debug` のみ使用 (esbuild 本番ビルドで drop される)。`console.log` 等は不可。
    - 各ステージで `nodes.length` と `edges.length` を出力。段階によって変数名が異なる場合は実際の変数を参照すること。
    - 既存ロジックは一切変更しない。挿入のみ。

  検証:
    - `pnpm build` が成功し main.js が生成される。
    - `pnpm lint` が PASS する。
    - `wc -l src/views/GraphViewContainer.ts` が 8580 以下。

  コミット:
    - ブランチ `investigate/139-1-nodecount-trace` にコミット。メッセージ例: `chore(debug): add temporary nodecount trace logs in getGraphData pipeline stages (#139-1)`
    - PR 作成や main へのマージは行わない。ブランチ push のみで完了。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
