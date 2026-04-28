## Description (subtask of 1485-dead-exports)

既に `1482` で一度処理されているが、未到達の dead exports が残っている可能性が高い。
  `pnpm knip` を src/parsers/ と src/layouts/ に絞って再実行し、現存する未使用 export を抽出する。

  各 export について:
  - 純粋関数で他から呼ばれていない → 削除または unexport
  - tests/ からのみ使用 → export 維持 (削除対象外)
  - 型エイリアス・interface で未使用 → 削除

  layouts はアルゴリズム関数群のため、API面の縮小を意識する。
  god object 4ファイルは触らない。
  `pnpm build && pnpm test` グリーン維持。削除件数を commit message に明記する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
