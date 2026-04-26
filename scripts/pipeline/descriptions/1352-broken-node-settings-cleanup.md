---
priority: high
reported: 2026-04-26
status: pending
source: user
summary: ノードサイズ等、機能していないグラフ設定を削除 (#1340 の続き)
---

## Description

ユーザー報告 (2026-04-26 20:42 JST):
> 「ノードの大きさの調整など、機能していないグラフ設定を削除してください。」

これは #1340 (graph-settings-cleanup、20:13 完了) の **延長**。
#1340 で gridStyle / showAttachments / gridTableMode / visualLinkEditor を削除したが、
ユーザーは追加で **「ノードサイズ調整」も機能していない** と報告。

### 「機能していない」の真因 (調査結果)

`panel.nodeSize` slider は `panel-sections-node-display.ts:68-78` に存在し、
`LayoutController.ts:112` / `GraphViewContainer.ts:7083` で参照されている。**コードの紐付けは存在する**。
しかし以下の上書きにより slider 値が体感的に効かない:

1. **`nodeSizeByDegree = true` (default)** が radius 計算を degree ベースに切替え、
   `panel.nodeSize` は base 値としてしか使われず、user が slider 動かしても見た目変化が小さい
2. **autoFit / zoom-aware shrinking** が `_zoomBaseNodeSize` factor で再計算
   (`GraphViewContainer.ts:6848, 8293-8297`)
3. **`requestAnimationFrame` 経由の再描画タイミング**で、slider 操作が反映されない可能性

### 機能不能候補 (削除 or 修復対象)

#### A. nodeSize slider 周辺 (#1340 と同パターン)
- `panel.nodeSize` slider — 体感で効かない
- `nodeSizeByDegree` toggle — 効くが user が混乱の元
- `_zoomBaseNodeSize` の覆い被せ — slider 値を上書き

#### B. その他「機能していない疑い」のある graph 設定 (要監査)
- `panel-sections-node-display.ts` の全 slider/toggle (~10 件) のうち、描画で参照されているか再 audit が必要
- `panel-sections.ts` 系 8 ファイル全体で同様の audit 推奨

### 過去事例 / 参照
- **#1340 graph-settings-cleanup** (20:13 完了) — gridStyle / showAttachments / gridTableMode / visualLinkEditor 削除
- memory `project_ui_control_audit.md` (2026-03-17) — 既存 audit 16 項目 (CRITICAL 3, HIGH 4, MEDIUM 6, LOW 3)
- v0.5.1: ツリー ViewMode 完全削除 (削除パターン参照)

## Acceptance criteria

### A. nodeSize 機能の挙動明確化
- [ ] 以下のいずれかを実装 (autonomous 判断)
  - **A-1.** `nodeSize` slider が常に有効になるよう `nodeSizeByDegree` の振る舞いを修正
    (degree モードでも slider 値を base に乗じる)
  - **A-2.** `nodeSize` slider を削除し `nodeSizeByDegree` の base 値のみを設定可能に変更
  - **A-3.** `nodeSizeByDegree=false` 時のみ `nodeSize` slider を表示する progressive disclosure

### B. 機能していない他の graph 設定の audit + 削除/修復
- [ ] `panel-sections-node-display.ts` の全コントロール (10+ 件) について「描画で参照されているか」確認
- [ ] 参照されていないトグル/スライダーは **削除** (memory `project_ui_control_audit.md` 監査の最新化)
- [ ] 参照されているが効果が薄いものは **rename / 説明文補強 / disabled 化** で UX 修復

### 品質 gate
- [ ] `pnpm test` 全 PASS、`pnpm lint` errors なし
- [ ] CLAUDE.md god object 限度値を超えない (nodeSize 削除分 PanelBuilder 縮小)
- [ ] memory `project_ui_control_audit.md` を更新 (Critical Issues セクション)

## Notes

- ユーザー issue → priority=high (#1340 と同 priority)
- decompose 推奨: A 系 1 task + B 系 (1 control = 1 task)
- src/ + tests/ のみ変更で auto-merge-pr.sh 対象になるよう task 設計
