## Description (subtask of 1370-dead-exports)

1. `pnpm exec knip --reporter json` または `pnpm exec ts-prune` で
     dead exports の一覧を取得し、tmp ファイル等には残さず stdout を読んで
     ファイルパスごとに分類する。
  2. `src/utils/` 配下にヒットした export について、以下の判定で対応する:
     - 同ファイル内のみで使われている → `export` キーワードを外す
     - 完全に未使用の関数/定数/型 → 関数本体ごと削除
     - 公開 API として明示的に保持したいものは対象外
     (テストからのみ参照されているものは「テスト用 export」として残し、
      対象外として扱う)
  3. 変更後 `pnpm build && pnpm test && pnpm lint` を通す。
  4. 削除/非 export 化した識別子の総数をコミットメッセージに記録する。
  対象スコープは `src/utils/` のみ。`src/views/` `src/layouts/` には触れない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
