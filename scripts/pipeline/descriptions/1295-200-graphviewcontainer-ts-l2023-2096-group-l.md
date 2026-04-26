## Description (subtask of 200-godobj-extract-tech-debt)

Phase E1 で Explore agent が特定済みの GraphViewContainer.ts L2023-2096 (group label hit-testing 周辺) を精読し、`this.` 依存の浅い純粋関数候補を特定する。
  - 新規ファイル `src/views/container-helpers/group-label-hit-test.ts` を作成し、抽出対象関数を移動する。`this.` で参照しているフィールドは関数引数として受け取る形に変える。
  - GraphViewContainer.ts 側は新ファイルから import して呼び出すよう書き換える。
  - 抽出後に GraphViewContainer.ts の実行行数を `wc -l` で確認し、CLAUDE.md の "Max Allowed" 行を実測値に更新する (ratchet down only)。
  - 検証: `pnpm test` 全 PASS、`bash scripts/pipeline/god-object-audit.sh` 全 PASS、`pnpm lint` PASS。
  - 注意: パブリック挙動を変えない pure refactor のみ。設定値・しきい値・ユーザ可視テキストは変更しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
