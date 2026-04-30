## Description (subtask of 1478-dead-exports)

src/parsers/ と src/layouts/ 配下の各 .ts で `^export` 行を列挙し、
  src/ 全体で参照ゼロの名前を特定する。
  - 内部ヘルパーは `export` キーワードを除去
  - 完全に未使用なら本体ごと削除
  - 既存テストが import している場合は残す (テスト経由の参照も「使われている」扱い)
  layout 関数は再エクスポート経路 (例: index.ts barrel) も確認する。
  変更後 `pnpm test` `pnpm lint` `pnpm build` が通ること、
  bundle size が 800KB を超えないこと (`ls -la main.js` で確認)。
  対象目安: 20〜30 件程度。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
