---
priority: medium
reported: 2026-04-27
status: pending
source: feature-proposal
summary: ホバー時に類似ノードTop3をサジェスト表示（Jaccard類似度）
persona: P2
---

## Persona
P2

## Full proposal

```
slug: hover-similar-suggest-top3
title: ホバー時に類似ノードTop3をサジェスト表示（Jaccard類似度）
persona: P2
rationale: P2リサーチャーは膨大な文献ノード間の関連を発見したいが、現状はグラフを「眺める」だけで能動的な発見支援がない。M3 (P4類似サジェスト)はフラグのみで未実装のまま。ホバー時にタグ・リンク重複度Top3を表示すれば、見落としていた関連文献に気づける。
scope_in:
- ノードホバー時、対象ノードと他全ノードのJaccard類似度を計算（タグ集合 ∪ リンク先集合）
- Top3を半透明オーバーレイカードで表示（ノード名 + スコア %）
- 設定 `showSimilarSuggestions` でON/OFF（デフォルトOFF、progressive disclosure）
- パフォーマンス: 計算は遅延（hover後150msデバウンス）、結果は `Map<nodeId, Top3>` でキャッシュ
scope_out:
- 類似度の計算式変更オプション（Jaccard固定）
- 4位以下の表示
- 類似ノードへのジャンプ操作（既存click-to-focusで十分）
- セマンティック類似（embedding）— タグ/リンクのみ
acceptance:
- [ ] CDP: `showSimilarSuggestions=true` + 任意ノードhover → 150ms後にTop3カードがDOM上に出現
- [ ] Unit test: `computeJaccardTop3(node, allNodes, k=3)` が共通タグ多/少ノード順で並ぶ
- [ ] Screenshot: ホバー前/後で右上にサジェストカードが表示される差分

---PROPOSAL---
slug: focus-mode-clear-button
title: フォーカスモードのクリアボタンとパンくず追加
persona: P4
rationale: P4ビジュアル思考ユーザーはfocusModeでノードを掘り下げるが、現状はトグルOFFしないと解除できず（UI監査#5「INCOMPLETE」記載）、どのノードに焦点中か視覚的に見えない。クリアボタン+パンくず（最近フォーカスした3ノード）を追加すれば、探索の戻り操作が直感的になる。
scope_in:
- フォーカスモード有効時、ツールバー右端に「✕ クリア」ボタン表示（focusNodeId=null化）
- 直近3ノードのfocusHistory配列を保持、パンくず形式でCanvas上部にHTML overlay表示
- パンくずクリックでそのノードに再フォーカス
- focusModeトグルOFF時は両UIとも非表示
scope_out:
- 履歴の永続化（セッション内のみ）
- 4件以上の履歴
- パンくずのドラッグ並び替え
- Ego レイアウトとの統合（別タスク）
acceptance:
- [ ] CDP: focusMode=true + node click → 「✕ クリア」ボタンがDOMに出現、クリックで focusNodeId=null
- [ ] Unit test: `focusHistory` が最大3件、最新が末尾、重複追加で既存削除→末尾追加
- [ ] Screenshot: 3ノード連続フォーカス後、パンくず3項目が表示される

---PROPOSAL---
slug: timeline-empty-space-compaction
title: タイムラインViewの空白圧縮 — 空年スキップ + 動的目盛り間引き
rationale: P3小説執筆ユーザーはタイムラインで story_order/start-date を可視化するが、UI監査CRITICAL#2で「80%+空白、目盛り洪水」と指摘済み。空年（イベントゼロ）を圧縮し、ズームレベルに応じて目盛り密度を動的調整すれば、密度の濃い時代と疎な時代の対比が一目で見える。
persona: P3
scope_in:
- 設定 `timelineCompactEmptyYears` (デフォルトtrue): 連続する空年範囲を「~~ 50年 ~~」ラベルで省略軸として圧縮表示
- ズームレベル別の目盛り間引き: zoom<0.5なら10年刻み、0.5-1.5なら年刻み、>1.5なら月刻み
- 圧縮区間にホバー時、省略された年範囲をtooltipで表示
- 既存 timeline-layout.ts の `timelineSortAndBuildSteps` 後段に `compactEmptyRanges` パイプライン追加
scope_out:
- 圧縮しきい値のユーザー設定（連続5年以上で固定）
- 月/日単位の圧縮（年単位のみ）
- 圧縮を解除する個別クリック操作
- categorical timeline（数値以外のstart-date値）の圧縮
acceptance:
- [ ] Unit test: `compactEmptyRanges([1990,1995,2050,2055])` → ranges=[{years:[1990,1995]},{gap:55},{years:[2050,2055]}]
- [ ] CDP: timelineCompactEmptyYears=true + 1900-2000空白vault → X軸幅が1990-2000のみに収まる
- [ ] Screenshot: 圧縮ON/OFF比較で空白率が80%→20%以下に減少
```
