## Description (subtask of 1471-settimeout-leaks)

src/ 配下の `setTimeout(` と `clearTimeout(` を grep で全件抽出し、
  ファイル別・行番号付きで一覧化する。各 setTimeout について:
  - 戻り値 ID が変数/フィールドに保存されているか
  - 同じ ID に対する clearTimeout が onunload/destroy/cleanup 系メソッドで呼ばれているか
  - コールバック内で完結し ID 保持不要なケース (self-clearing) か
  を判定する。

  成果物: `docs/setTimeout-audit.md` (新規作成可) に
  「ファイル:行 / ID 保存先 / クリア箇所 / 判定 (cleared/self-clearing/leaked)」
  の表を書き出す。leaked と判定された箇所が 18 件前後あるはず。
  ソースコードは変更しない (調査のみ)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
