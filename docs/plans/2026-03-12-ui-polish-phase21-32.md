# UI 洗練化 Phase 21-32 実装プラン

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** パネル可読性、グラフ描画の美しさ、操作性、データ表現力を全方位的に改善する。

**Architecture:** 12の独立した機能を Phase 21〜32 として順次実装。Phase 21-26 は CSS + 軽微 JS、Phase 27-32 は JS 中心。

**Tech Stack:** TypeScript, CSS, Obsidian API, Canvas2D

**絶対条件**: 既存のコントロール・オプション・設定は一切削除しない。

---

## Phase 21: ラベル省略 + ツールチップ
**Files:** `styles.css`, `src/views/PanelBuilder.ts`
- `.setting-item-name` に `text-overflow: ellipsis` + `overflow: hidden` + `white-space: nowrap`
- `title` 属性でフルテキスト表示
- パネル幅 240px でも読みやすく

## Phase 22: ノードグラデーション & グロー
**Files:** `src/views/canvas2d/CanvasApp.ts`
- ノード描画に `ctx.createRadialGradient` で中心明るく外周暗く
- 高次数ノード（ハブ）に外側グロー（shadowBlur）

## Phase 23: エッジタイプ別スタイル
**Files:** `src/views/EdgeRenderer.ts`
- link: 実線（既存）
- semantic: 点線 `setLineDash([4, 4])`
- tag/has-tag: 破線 `setLineDash([8, 4])`

## Phase 24: キーボードショートカット
**Files:** `src/views/GraphViewContainer.ts`
- Ctrl+F / Cmd+F: 検索フォーカス
- Space: フィットビュー
- 1-4: タブ切替
- Escape: パネル/ポップアップ閉じ

## Phase 25: ズームインジケーター + フルスクリーンモード
**Files:** `src/views/GraphViewContainer.ts`, `styles.css`
- ツールバーにズーム % 表示
- フルスクリーンボタン（パネル・ツールバー非表示）

## Phase 26: エンクロージャーグラデーション
**Files:** `src/views/EnclosureRenderer.ts`
- 単色 → 中心→外周の放射グラデーション
- alpha を中心で高く、外周で低く

## Phase 27: パネル幅ドラッグリサイズ
**Files:** `src/views/PanelBuilder.ts`, `styles.css`
- パネル左端にドラッグハンドル
- `--graph-controls-width` CSS変数を動的更新
- 最小幅 180px、最大幅 480px

## Phase 28: 右クリックコンテキストメニュー
**Files:** `src/views/InteractionManager.ts`, `styles.css`
- ノード右クリック: ファイルを開く、接続を表示、ピン留め
- キャンバス右クリック: フィットビュー、PNG出力

## Phase 29: ヒートマップモード
**Files:** `src/views/GraphViewContainer.ts`, `src/views/PanelBuilder.ts`
- 表示タブに「カラーモード」ドロップダウン追加
- off / degree / modified / filesize

## Phase 30: コンテキスト設定（条件付き表示）
**Files:** `src/views/PanelBuilder.ts`
- groupBy 未設定時: クラスター配置セクション非表示
- showTags=off 時: タグ関連設定を dim

## Phase 31: パスファインダー
**Files:** `src/views/GraphViewContainer.ts`, `src/utils/pathfinder.ts`(新)
- 2ノード選択で最短パスハイライト
- BFS ベースのパス探索

## Phase 32: タイムラインスライダー
**Files:** `src/views/PanelBuilder.ts`, `src/views/GraphViewContainer.ts`
- デュアルレンジスライダー（日付範囲）
- フロントマターの日付フィールドでフィルター
