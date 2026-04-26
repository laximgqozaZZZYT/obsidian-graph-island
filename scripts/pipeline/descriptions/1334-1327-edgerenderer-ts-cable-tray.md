## Description (subtask of 1327-god-object-violation)

src/views/EdgeRenderer.ts は現在 2765 行で limit 2702 を 63 行超過している。
  CLAUDE.md の decomposition priority 3 に従い、cable-tray 関連の描画ロジックを
  新規ファイル src/views/edge-renderer/cable-tray.ts へ純粋関数として抽出する。

  手順:
  1. src/views/EdgeRenderer.ts を精読し、cable-tray 関連メソッド/ヘルパー
     (drawCableTray, computeCableTrayPath, cable-tray の路線計算など)
     を特定する。
  2. それらを新規ファイル src/views/edge-renderer/cable-tray.ts に
     export 関数として移動する。可能な限り ctx 非依存の純粋関数にし、
     ctx を引数で受け取る形にする。
  3. EdgeRenderer.ts は import して呼び出すだけに置き換える。
  4. 既存の単体テスト (pnpm test) を全て PASS させる。
  5. 完了条件: src/views/EdgeRenderer.ts が 2702 行以下になる
     (CLAUDE.md の Max Allowed を満たす)。
  6. CLAUDE.md の forbidden patterns を踏まない (RenderThresholds 経由、
     hardcoded numbers 禁止、console.* 禁止)。

  禁止: EdgeRenderer.ts に新たな機能追加や挙動変更をしない。
  純粋なファイル分割のみを行う。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
