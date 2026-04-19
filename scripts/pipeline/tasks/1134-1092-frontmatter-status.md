---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 1092-1072-subtask
depends: 1091-1072-active
summary: 入力ファイルパスの存在確認と frontmatter 単一 status 行バリデーション
---

## Description (subtask of 1092-1072-subtask)

1. subtask-1 (1091-1072-active) の出力ログ/成果物から対象ファイルパスを 1 件取得。
  2. Read ツールで全文読み込み、先頭 frontmatter ブロック (`---` で囲まれた領域) を抽出。
  3. 以下をすべて検証し、いずれか 1 つでも満たさない場合は **no-op で abort** してその旨をログ出力:
     - `status:` で始まる行がちょうど 1 行のみ (frontmatter 内外含め)。
     - その値が `decomposed` または `in-progress` のいずれか。
     - ファイルパスが禁止領域 (src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs, GOD OBJECT 4ファイル) に該当しない。
  4. バリデーション合格時のみ、抽出した `status:` 行の現在値と行番号を subtask-2 に引き渡す (コード変更なし、read-only)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
