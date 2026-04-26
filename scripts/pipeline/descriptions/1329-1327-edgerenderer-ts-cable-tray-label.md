## Description (subtask of 1327-god-object-violation)

src/views/EdgeRenderer.ts (現在 2765 行 / 上限 2702 行) を精読し、CLAUDE.md の
  decomposition 指針 (cable-tray rendering, label rendering) に従って独立した
  純粋関数または独立クラスを src/views/edge-rendering/ 配下の新規ファイルへ抽出する。
  抽出対象は精読の上で確定すること (例: cable-tray の経路計算ヘルパ群、ラベル衝突
  回避ヘルパ群など)。EdgeRenderer.ts からは抽出関数を import して使用するように
  書き換え、ファイル行数を 2702 行以下にする。
  作業手順:
    1. wc -l src/views/EdgeRenderer.ts で現在行数を確認
    2. EdgeRenderer.ts を読み、抽出可能な独立ロジックブロック (一塊の関数群) を特定
    3. src/views/edge-rendering/ 以下に新規ファイルを作成し関数を移動
    4. EdgeRenderer.ts 側を import 経由の呼び出しに置き換える
    5. pnpm test で既存テストが緑のままであることを確認
    6. wc -l src/views/EdgeRenderer.ts で 2702 行以下を確認
  禁止事項:
    - CLAUDE.md の Max Allowed を引き上げる変更
    - public API の互換を壊す変更
    - console.* の追加

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
