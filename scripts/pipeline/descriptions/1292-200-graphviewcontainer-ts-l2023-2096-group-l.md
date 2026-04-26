## Description (subtask of 200-godobj-extract-tech-debt)

Phase E1 で Explore agent が候補特定済の L2023-2096 (group label hit-testing) を中心に、GraphViewContainer.ts から純粋関数を 231 行以上 extract する。
  - 新規ファイル `src/views/container-helpers/group-label-hit.ts` を作成し、this. 依存のない hit-testing ロジックを移動する
  - `this.` に依存する箇所は引数として state を受け取る純粋関数シグネチャに変換する
  - GraphViewContainer.ts 側は新ファイルから import し、wrapper メソッドのみを残す
  - CLAUDE.md の `src/views/GraphViewContainer.ts` Max Allowed を 8655 → 8424 に戻す
  - `bash scripts/pipeline/god-object-audit.sh` で GraphViewContainer.ts が PASS することを確認する
  - `pnpm test` 全 PASS を確認する

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
