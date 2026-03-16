# Cable Routing v10 — 次セッション引き継ぎプロンプト

> **このファイルを次のセッションのプロンプトとしてそのまま貼り付けてください。**

---

## 状況

`drawCables()` を3層ケーブルモデル（幹線/ケーブル/電線）に改修中。
ビルドは通るが、**描画結果が要求を満たしていない**。

### 現在のブランチ
`feat/road-network-v4`

### 変更済みファイル（ビルド通る状態）
- `src/layouts/cable-tray.ts` — `cachedFindShortestPath`, `invalidatePathCache` 追加済み
- `src/views/EdgeRenderer.ts` — `CableLayout` 変更済み、`computeCableLayout` / `drawCables` / `_drawSmoothPath` / `_drawStub` 書き直し済み

### 変更していないファイル
- `src/views/GraphViewContainer.ts` — 触らない
- `buildCables()` in EdgeRenderer.ts — ケーブル構築ロジックは変更なし

---

## チェックリスト（メモリ保存済み: `project_cable_routing_checklist.md`）

### 構造
1. グループ間結線は**幹線**。1本の幹線が複数ケーブルを収容
2. グループ内配線は**ケーブル**。1本のケーブルが複数電線を収容
3. ノードへの引き込みは**電線**ごと。1本ずつ引き込む

### 描画ルール
4. 幹線・ケーブルは**半透明**。中の電線が透けて見える
5. 電線は**色付き**
6. 電線の引き込み位置は**ずらす**（同一ノードへの複数電線が重ならない）
7. 引き込み口は**1ノードにつき1つ**だけ
8. 同一グループ内のスタブ方向は**統一**

### 経路ルール
9. 幹線・ケーブルはロードネットワークの実パスに沿う
10. 方向転換点のみ quadraticCurveTo、直線区間はそのまま
11. 同一ノードへのケーブル/電線が重複描画されない

### NG事項
12. シース幅が太すぎて画面を覆う → NG（**現在発動中**）
13. アーク中間点でスパイラル生成 → NG
14. ブランチを全エッジ×2回描画 → NG（**現在疑いあり**）
15. ファイル読まずにコード適用 → NG

---

## 現在の検証結果（スクリーンショットより）

| 項目 | 判定 |
|------|------|
| #5 電線色付き | PASS |
| #9 ロードネットワーク経路 | **FAIL** — 全線が重心間直線。Dijkstra経路ではない |
| #10 方向転換でquadratic | **FAIL** — 転換点が存在しない |
| #11 重複描画なし | **FAIL疑い** — 異常な密度 |
| #12 太柱NG | **NG発動** — 画面の大部分が太い線で覆われている |

---

## 診断済みの根本原因

### 原因1: ロードネットワーク経路が使われていない
`computeCableLayout` で `trunkPath` が `[cA, cB]` の2点直線にフォールバックしている可能性が高い。
確認すべき点:
- `cfg.roadNetwork` が `drawCables` 呼び出し時に null でないか
- `findNearestIntersection` が srcId === tgtId を返していないか
- `cachedFindShortestPath` のパスが `length >= 2` を満たしているか

### 原因2: Conduit幅が膨張
```typescript
const trunkConduitWidth = Math.max(nLanes * CABLE_LANE_SPACING + 4, 6);
```
nLanes が大きい（MAX_CABLE_COLORS=8）場合、conduit幅 = 8*3+4 = 28px。
これに cable conduit + wire が重なると太柱化する。
→ **conduit幅に上限を設ける** (max 10px程度)

### 原因3: 描画量が多すぎる
2353ノードで254色。ケーブル本数が非常に多い。
→ conduit/wire の alpha を下げるか、LOD で遠距離のケーブルを間引く必要あり

---

## やるべきこと

### Step 1: まず Obsidian外のHTML検証環境を作る
単独HTMLファイルで3クラスタ×5-8ノードの小規模テスト。
Canvas 2D で `cable-tray.ts` と `EdgeRenderer.ts` のアルゴリズムをポーティングし、
チェックリスト全項目を目視で確認できるようにする。

### Step 2: 根本原因を修正
1. `computeCableLayout` のロードネットワーク経路フォールバック条件をデバッグ
2. conduit幅に上限 (例: `Math.min(trunkConduitWidth, 10)`)
3. 重複描画の排除を確認

### Step 3: 修正後にビルド・デプロイ・検証
チェックリスト全項目 PASS を確認してから完了とする。

---

## 再利用する既存関数（cable-tray.ts）
- `findShortestPath()` — Dijkstra本体
- `cachedFindShortestPath()` — キャッシュ付きラッパー（今回追加）
- `pathToWaypoints()` — パス→座標変換（arcウェイポイント含む）
- `findNearestIntersection()` — 最寄りジャンクション
- `invalidatePathCache()` — キャッシュ無効化（今回追加）

## 現在の描画関数（EdgeRenderer.ts）
- `computeCableLayout()` — trunkPath + trunkIsectIds を返す
- `drawCables()` — 4パス描画（conduit → wire trunk → wire cable → stub）
- `_drawSmoothPath()` — quadraticCurveTo 付きパス描画
- `_drawStub()` — エッジ単位のスタブ描画（ノード端オフセット）

## 失敗教訓（v10 試行1-4）
1. 新ファイル作成 + シース付き描画 → シース幅38pxで画面が太い柱で覆われた
2. pathToWaypoints のpolarアーク中間点がスパイラルを生成
3. ブランチを全エッジ×2回描画 → 重複排除が必須
4. プランのコードをファイル読まずに適用 → 型名不一致でビルド不能

## 鉄則
- **ファイルは必ず読んでから編集**
- **ユーザーに動作確認を依頼するな。自分で検証しろ**（HTML環境 or CDP）
- **マジックナンバーは全て定数化**
