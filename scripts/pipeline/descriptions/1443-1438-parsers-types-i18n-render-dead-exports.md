## Description (subtask of 1438-dead-exports)

subtask-1, 2 で未処理のディレクトリの dead exports を ts-prune で抽出して
  削除。最後に `pnpm exec ts-prune | wc -l` で残数を確認し、
  acceptance criteria の「50個以下」を満たすことを検証する。
  満たさない場合は subtask-1, 2 で見送った export を再精査して追加削除。
  `pnpm test` `pnpm lint` `pnpm build` 全て通すこと。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
