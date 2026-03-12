# UI 洗練化 Phase 12-20 実装プラン

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ビジュアルの深み・操作フィードバック・情報階層・アクセシビリティを全方位的に改善し、プロダクトレベルのUIに仕上げる。

**Architecture:** 9つの独立した機能を Phase 12〜20 として順次実装。大半は CSS 中心で低リスク。Phase 15/16/17/19 は軽微な JS 変更を含む。

**Tech Stack:** TypeScript, CSS, Obsidian API (setIcon, Notice), Canvas2D

**絶対条件**: 既存のコントロール・オプション・設定は一切削除しない。

---

## Phase 12: ボタン階層化 & プレスフィードバック

**Files:** `styles.css`

- Primary ボタン: `background: var(--interactive-accent)`, 白文字, 角丸
- Secondary ボタン: アウトライン（border のみ）、透過背景
- クリック: `transform: scale(0.97)` + `transition 0.1s`
- ホバー: 影追加 + `translateY(-1px)`
- 削除ボタン: 赤アウトライン + ホバーで赤背景

### E2E テスト
- ボタンの computed style に transition が含まれること
- Primary ボタンに background-color が設定されていること

---

## Phase 13: スライダートラック充填

**Files:** `styles.css`, `src/views/PanelBuilder.ts`

- CSS: `linear-gradient` で `--progress` 変数に基づく塗り分け
- JS: `input` イベントで `--progress` CSS 変数を更新
- `::-webkit-slider-runnable-track` にグラデーション適用

### E2E テスト
- スライダーに `--progress` CSS 変数が設定されていること

---

## Phase 14: ドロップダウン・ポップアップアニメーション

**Files:** `styles.css`

- `@keyframes gi-popup-enter` (scale 0.95→1, fade)
- `.gi-ont-rel-popup`, `.gi-ac-popup` にアニメ適用
- レイヤードシャドウ: `0 2px 4px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.12)`

### E2E テスト
- ポップアップ要素に animation プロパティが設定されていること

---

## Phase 15: フローティング要素強化

**Files:** `styles.css`, `src/views/GraphViewContainer.ts`, `src/views/Minimap.ts`

- 凡例: ドラッグハンドル、×閉じるボタン、エントランスアニメ
- ノード情報: レイヤードシャドウ、Escape で閉じる
- ミニマップ: grip テクスチャ、cursor grab/grabbing、ビューポート角丸

### E2E テスト
- 凡例に閉じるボタンが存在すること
- ミニマップに cursor: grab スタイルが設定されていること

---

## Phase 16: 検索 UX 改善

**Files:** `styles.css`, `src/views/PanelBuilder.ts`

- 検索アイコン（SVG）を input 左側
- クリアボタン（×）を値がある時のみ表示
- マッチテキストハイライト

### E2E テスト
- 検索入力にクリアボタンが存在すること

---

## Phase 17: セクションヘッダー強化

**Files:** `styles.css`, `src/views/PanelBuilder.ts`

- 折りたたみ矢印に回転アニメーション
- ヘッダー下セパレーター
- セクションアイコン（setIcon API）

### E2E テスト
- セクションヘッダーにアイコンが含まれること
- 矢印に transition が設定されていること

---

## Phase 18: フォーム状態の視覚化

**Files:** `styles.css`

- Disabled: opacity 0.4 + pointer-events none
- フォーカス: box-shadow リング強化
- スケルトンパルスアニメーション

### E2E テスト
- disabled 要素に pointer-events: none が設定されていること

---

## Phase 19: エンクロージャーラベル改善

**Files:** `src/views/GraphViewContainer.ts`（Canvas描画）

- テキスト背景にピル型半透明矩形
- ホバー時ラベル alpha 上昇

### E2E テスト
- エンクロージャーラベル描画メソッドが存在すること

---

## Phase 20: アクセシビリティ強化

**Files:** `styles.css`, `src/views/PanelBuilder.ts`

- focus-visible: 2px dashed + offset
- トグルにチェックマーク
- min-height: 32px

### E2E テスト
- focus-visible CSS ルールが存在すること
- インタラクティブ要素の min-height が 32px 以上であること

---

## 実装順序

推奨: **12 → 13 → 14 → 17 → 18 → 20 → 16 → 15 → 19**

（CSS のみ → CSS+軽微JS → JS変更あり の順）
