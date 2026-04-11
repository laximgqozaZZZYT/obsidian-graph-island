---
priority: medium
reported: 2026-04-11
status: pending
source: kaizen
summary: graph-analysis.ts の betweennessCentrality に非null assertion が連鎖しており防御がない
---

## Description

`src/analysis/graph-analysis.ts` の `betweennessCentrality()` (行130–183) で、
Map.get() に対する非null assertion (`!`) が15箇所連鎖している。

問題箇所:
- 行153: `queue.shift()!` — queue.length>0 チェック直後なので安全だが一貫性がない
- 行155: `dist.get(v)!` — v は queue から取り出した値で dist に存在する保証がコードから離れている
- 行157: `dist.get(w)!` — w は adj の隣接ノードで、dist 初期化は全 nodes に対して行うが adj のキーと nodes が一致しない場合は undefined
- 行164: `sigma.get(w)! + sigma.get(v)!` — 同上
- 行165: `pred.get(w)!.push(v)` — pred は nodes で初期化するが adj 由来の w が nodes に含まれない場合に crash
- 行175–180: delta/sigma/pred/bc の連鎖 `!` — 同一パターンの繰り返し

同様のパターンが `articulationPoints()` (行220–240) にも存在:
- 行231: `low.get(u)!`, `low.get(v)!`
- 行236: `low.get(v)! >= disc.get(u)!`

**現状のリスク**: 現行コードでは `nodes` と `adj` が同一データソースから生成されるため、
実際には crash しない可能性が高い。しかし:
1. 将来的にフィルタリング等で nodes と adj の整合性が崩れた場合に runtime crash する
2. TypeScript の型安全性が `!` で無効化されており、コンパイラが不整合を検出できない
3. 15箇所の `!` が密集しておりコードレビューで見落としやすい

## Acceptance criteria

- [ ] `betweennessCentrality` 内の `Map.get()!` を `?? 0` (数値) / `?? []` (配列) のデフォルト値パターンに置き換える
- [ ] `articulationPoints` 内も同様に対応する
- [ ] 既存テスト (`pnpm test`) がパスする
