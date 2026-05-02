## Description (subtask of 1669-dead-exports)

`node scripts/list-dead-exports.mjs` を実行し `tmp/dead-exports-report.md` の
  Category C セクションから `src/constants.ts` に該当する45件のシンボル名を抽出する。
  該当する `export const`, `export function`, `export type` の宣言を `src/constants.ts`
  から削除する (export キーワードを外すのではなく宣言ごと削除)。
  
  各シンボルについて削除前に `Grep` で `src/` 配下の参照をゼロ件であることを確認すること
  (テスト除く)。テスト (`tests/`) からの参照がある場合はそのシンボルは Category C ではないので
  削除しないでスキップ。
  
  完了基準:
  - `pnpm build` が成功する
  - `pnpm test` が PASS する
  - `node scripts/list-dead-exports.mjs` の C カウントが 151 → 約 106 に減る
  
  CLAUDE.md ルール: ハードコード追加禁止、God Object 非対象、`console.*` 追加禁止。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
