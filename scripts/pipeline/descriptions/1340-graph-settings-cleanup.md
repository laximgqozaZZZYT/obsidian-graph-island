---
priority: high
reported: 2026-04-26
status: pending
source: user
summary: グラフ設定のうち、まともに動作していない or バグだらけの機能を削除
---

## Description

ユーザー報告 (2026-04-26 19:00 JST):
> 「グラフ設定のうち、まともに動作していない or バグだらけの機能を削除してください」

`PanelBuilder.ts` (1719 行) は `panel-sections-*.ts` (8 ファイル) と合わせて **設定トグル/コントロール 68 件** を抱えており、
過去 audit で複数の ghost property / 未実装 / 壊れた挙動が確認されている。

### 削除候補 (memory: project_ui_control_audit.md, 2026-03-17 監査結果より)

#### CRITICAL — Ghost property (トグルしても何も変わらない)

1. **`gridStyle`** (`"lines" | "table"`)
   - PanelBuilder ライン 120 (state), 263 (default), ~1572 (control)
   - PanelBuilder 外で zero references — 描画には未使用
   - **削除 or 実装**

2. **`showAttachments`** (toggle)
   - ライン 30, 259, 650
   - ファイル拡張子チェックのみで使用、グラフフィルタには無関係
   - **削除 or 実装**

3. **`gridTableMode`** (gate control toggle)
   - ライン 110, 259, 1530
   - 描画コードから never checked、他コントロールの progressive disclosure ゲートでしかない
   - **rename して機能を明確化、または削除**

#### LIKELY — 未実装/未完成

4. **`visualLinkEditor`** (toggle)
   - ライン 162, 748。getter (1540) はあるが呼ばれない
   - **削除 or 実装**

5. **`focusMode` + `focusNodeId`** (incomplete)
   - focusNodeId はクリックで設定されるが clear ボタンがない
   - mode off にしないとクリア不能 → 使いづらい
   - **clear ボタン追加 or 機能削除**

#### BROKEN UX — 動くが破綻している

- **`cableBundleMode = "always"`** — clusters なしでは効果なし
- **`cardDisplayConfig`** — `nodeDisplayMode` 切替時に設定が hide → 編集不能になる
- **`donutDisplayConfig`** — 同上

### スコープ判断指針

機能ごとに以下のいずれかを選択 (autonomous decompose 可能な単位):
- **A. 完全削除** — state field, default, control UI, 関連テスト, i18n キーを全削除
- **B. 実装完了** — 既存 type 定義に合致するロジックを追加 (rendering / filtering)
- **C. UX 修復** — 不可視ゲートを明示化、設定保護、clear ボタン追加など

ユーザーは **A (削除)** を主に希望しているため、デフォルトは A に倒す。
ただし以下は **削除前に user 確認が必要**:
- `focusMode` (focus 系全般): user が使っている可能性
- `cardDisplayConfig` / `donutDisplayConfig`: 表示モードに紐付く視覚機能

### 過去事例 (削除パターン参照)

- v0.5.1: ツリー ViewMode 完全削除 (types.ts, GVC, PanelBuilder, view-mode-sections, view-mode-map)
- v0.5.1: サプライズ機能完全削除 (ツールバー, _triggerSurprise, タイマー, i18n 8 キー)

→ memory `project_field_renames.md` に同種の cleanup 履歴あり。

## Acceptance criteria

- [ ] 以下の ghost property は **A (削除)** で対応:
  - [ ] `gridStyle`
  - [ ] `showAttachments`
  - [ ] `gridTableMode` (rename or remove、autonomous 判断)
  - [ ] `visualLinkEditor`
- [ ] 以下は **C (UX 修復)** で対応:
  - [ ] `focusMode` + `focusNodeId`: clear ボタン追加
  - [ ] `cableBundleMode = "always"`: clusters なし時に disabled 表示
  - [ ] `cardDisplayConfig` / `donutDisplayConfig`: 切替時に保護(disable but not hidden)
- [ ] 削除した state field の default は settings migration で消去 (旧 settings からの load で warn しない)
- [ ] テストの該当アサート削除 + lint/format/test 全 PASS
- [ ] **CLAUDE.md の god object 限度値を下げる** (PanelBuilder.ts: 1719 → 削除分)
- [ ] memory `project_ui_control_audit.md` の Critical Issues セクションを「Resolved」に更新

## Notes

- ユーザー issue のため autonomous より priority 高
- decompose 推奨単位: 1 機能 = 1 task (8 task くらいに分解可)
- 各 task は src/ + tests/ のみに変更を限定すれば auto-merge-pr.sh の対象になる
- **削除確定の 4 件 (gridStyle / showAttachments / gridTableMode / visualLinkEditor)** から先行着手、UX 修復系は後回し
