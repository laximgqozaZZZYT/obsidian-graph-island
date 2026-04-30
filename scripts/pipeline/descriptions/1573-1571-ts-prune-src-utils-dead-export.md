## Description (subtask of 1571-dead-exports)

1. `pnpm dlx ts-prune` を実行して dead exports 一覧を取得し、
     件数とファイル別内訳を確認する。
  2. src/utils/ 配下のファイルに限定して、未使用 export を処理する:
     - 同ファイル内のみで使われている関数: `export` キーワードを外して
       internal 化する
     - 完全に未使用 (ファイル内でも参照なし) の関数: 関数定義ごと削除する
     - 削除前に必ず `grep -r "識別子名" src/ tests/` で参照がないことを確認する
  3. 触ってはいけないファイル: GraphViewContainer.ts, PanelBuilder.ts,
     EdgeRenderer.ts, RenderPipeline.ts (CLAUDE.md の GOD OBJECT)
  4. 検証: `pnpm test` と `pnpm build` が PASS すること
  5. コミットメッセージに「src/utils/ から N 件削除 (ts-prune 実測)」と記載
```

```

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
