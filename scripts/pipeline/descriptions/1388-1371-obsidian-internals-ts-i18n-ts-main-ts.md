## Description (subtask of 1371-type-assertions)

以下3ファイルに集中している型アサーションを、適切な型ガード関数 (`x is T`) または正しい型注釈に置換する。
  - `src/obsidian-internals.ts`: `as ` 6件 + `as unknown` 6件 = 12件 → Obsidian internal API への型付けを `interface ObsidianInternalApp { ... }` 等の専用 interface 拡張で置き換え、`(app as unknown as InternalApp)` パターンを 1 箇所のヘルパー関数に集約する。
  - `src/i18n.ts`: `as ` 8件 + `as unknown` 1件 = 9件 → `t()` の戻り値や辞書アクセスの `as string` を、辞書型を `Record<Locale, Record<TKey, string>>` で正しく定義することで除去する。
  - `src/main.ts`: `as ` 5件 → Plugin lifecycle まわりの `as` を `instanceof` チェックや専用型ガードで置換。
  受け入れ基準: 上記 3 ファイル合計の `as ` / `as unknown` 件数を `git grep` で計測し、26件 → 10件以下に削減する。挙動変更禁止 (vitest 全 PASS 維持)。GOD OBJECT 規模ではないが、各ファイルの行数増は禁止。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
