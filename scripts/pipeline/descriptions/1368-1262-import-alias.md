## Description (subtask of 1262-type-assertions)

現在 grep " as [A-Z]" で 235 件ヒットするが、`import { X as Y }` の named import alias と、`import * as X` がカウントに混入している (例: GraphViewContainer.ts の 81件中、冒頭 25行以上は全て import alias)。

  実装内容:
  1. `scripts/count-type-assertions.sh` を新規作成。grep に `--exclude` 相当の正規表現で `^import` 行と `} from` を含む行を除外し、純粋な型アサーション (`expr as Type`) のみカウント。
  2. スクリプト実行で出力される正確なベースライン件数とファイル別 top 10 を、issue ファイルの description (このタスクが置かれている tasks 配下の YAML frontmatter ではなく description 本文) に追記する。
  3. `src/utils/type-guards.ts` を新規作成し、空の type guard モジュールの土台を置く (`export function isNodeShape(v: unknown): v is NodeShape` 等の シグネチャを宣言)。実装は次タスク以降で追加。
  4. `pnpm test` と `pnpm lint` が通ることを確認しコミット。

  scope:
  - 触ってよい: `src/utils/type-guards.ts` (新規), `scripts/count-type-assertions.sh` (新規)
  - 触らない: GOD OBJECT 4ファイル

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
