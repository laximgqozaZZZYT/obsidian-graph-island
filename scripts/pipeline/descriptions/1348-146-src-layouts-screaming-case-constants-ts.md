## Description (subtask of 146-scattered-constants)

src/layouts/ 配下の各 .ts ファイルを精読し、トップレベルで定義された
  SCREAMING_CASE 定数(`const FOO_BAR = ...`)を列挙する。
  そのうち、複数ファイルから参照されうる/将来参照されうる
  汎用閾値・係数のみを src/constants.ts に移動する
  (1ファイル内クローズドな private 定数はそのまま残す)。
  対象ファイルの import を `import { ... } from '../constants'` に書き換える。
  `pnpm build` と `pnpm test` が通ることを確認してコミット。
  既に RenderThresholds に同等のものがある場合は重複定義を作らず既存を再利用する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
