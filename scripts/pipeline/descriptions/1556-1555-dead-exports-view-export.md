## Description (subtask of 1555-dead-exports)

1. scripts/find-dead-exports.mjs を作成 (既存があれば流用)。
     - tsc --noEmit でASTを走査するか、ripgrep でexport定義一覧 → 各識別子が他ファイルでimportされているかを照合する自前スクリプト。
     - 出力: ファイルパス + 識別子名 + 種別(function/const/type/interface/class) のリスト。
     - package.json の scripts に "dead-exports": "node scripts/find-dead-exports.mjs" を追加。
  2. スクリプトを実行し、現状111件中src/utils/, src/parsers/, src/layouts/, src/i18n.ts, src/types.ts, src/constants.ts に該当する識別子を抽出。
  3. それぞれについて以下のいずれかを実施:
     - 純粋に未使用 → 定義ごと削除
     - テスト専用export → そのままexport維持(スクリプト側でtests/配下のimportも参照に含めるよう修正)
     - 将来の公開API候補 → コメント "// @public" を付け削除リストから除外
  4. pnpm test / pnpm lint / pnpm build を通す。pnpm dead-exports の出力件数を最終的に60件前後まで下げる。
  5. CLAUDE.md の Forbidden Patterns 「God Object を肥大化させない」に違反していないことを行数で確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
