## Description (subtask of 1327-god-object-violation)

src/views/EdgeRenderer.ts は現在 2765 行で CLAUDE.md の上限 2702 を 63 行超過している。
  
  作業手順:
  1. src/views/EdgeRenderer.ts を精読し、cable-tray 描画に関する関数群（drawCableTray 系、cable bundle 計算、cable lane 配置などのプライベートメソッド）を特定する。
  2. 特定した関数を新規ファイル src/views/edge-rendering/cable-tray-renderer.ts に純粋関数として export する形で抽出する。state を持たないように引数で ctx / 設定 / レーン情報を受け取る形にする。
  3. EdgeRenderer.ts 側は新ファイルから import して呼び出すだけに置き換え、抽出元のメソッド本体は削除する。
  4. 抽出後、EdgeRenderer.ts の行数が 2702 以下であることを `wc -l src/views/EdgeRenderer.ts` で確認する。
  5. `pnpm test` を実行し、EdgeRenderer 関連の既存テストが PASS することを確認する。新規抽出関数に対する単体テスト追加は本タスク範囲外（上限内に収めるのが本タスクの目的）。
  6. `pnpm lint` と `pnpm format:check` を実行して通すこと。
  
  禁止事項:
  - EdgeRenderer.ts の行数を増やさない（必ず 2702 以下にする）。
  - 既存の描画挙動を変えない。座標計算・色・スタイル分岐はそのまま移植する。
  - ハードコード値の追加禁止（既存 RenderThresholds 参照は維持）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
