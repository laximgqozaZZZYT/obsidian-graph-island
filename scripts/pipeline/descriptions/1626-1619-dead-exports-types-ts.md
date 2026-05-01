## Description (subtask of 1619-dead-exports)

subtask-2 完了後、`pnpm exec ts-prune` を再実行し、残存 dead exports が 50件以下に
  なっているか確認する。50件を超えていれば、優先度の高いもの(types.ts の未使用 type/interface、
  i18n.ts の未使用キー、main.ts のヘルパー等)から追加で削除/unexport する。
  処理対象の典型例:
  - `src/types.ts`: 未使用の interface/type alias
  - `src/i18n.ts`: テストや UI から参照されない i18n キー
  - 未使用の re-export
  完了条件:
  - `pnpm exec ts-prune` の結果が 50件以下
  - `pnpm test` PASS
  - `pnpm build` PASS
  - `pnpm lint` PASS
  - `pnpm format:check` PASS
  - バンドルサイズ(`main.js`)が 800KB 以下を維持
  - 公開 API として意図的に維持する export がある場合は、その export 上に
    `// public API: 〜` の1行コメントを残し、ts-prune の `// ts-prune-ignore-next` で抑制する

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
