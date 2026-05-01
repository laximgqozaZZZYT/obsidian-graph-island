## Description (subtask of 1632-settimeout-leaks)

1. リポジトリ全体を grep して残りの setTimeout 呼び出し箇所を列挙する
     (subtask-1 で GraphViewContainer は対応済みのため除外)。
  2. 各箇所について:
     - そのコンポーネントが GraphViewContainer 配下なら、コンストラクタ等で
       timerRegistry を受け取り共有する
     - コンポーネント独立で寿命を持つなら自分自身で TimerRegistry を保持し
       destroy/unload 時に clearAll する
  3. setTimeout 戻り値を捨てている "fire-and-forget" パターンも全て登録対象にする。
  4. 各 god object は Max Allowed を超えないこと。超える場合は src/utils/ に
     抽出する。コードコメントは増やさず、ロジック移動で解決する。
  5. pnpm build / pnpm test で確認しコミット。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
