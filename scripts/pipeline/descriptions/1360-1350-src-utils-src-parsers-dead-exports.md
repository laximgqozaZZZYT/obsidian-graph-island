## Description (subtask of 1350-dead-exports)

作業手順:
  1. `npx ts-prune -p tsconfig.json` または `npx knip` で dead exports を列挙し、
     `src/utils/` と `src/parsers/` 配下のものだけを抽出する。
  2. 各 dead export について `grep -rn "import.*<name>" src/ tests/` で
     使用箇所を再確認する。tests/ から import されている場合は dead 扱いしない。
  3. 真に未使用な関数/型/定数は:
     - 関数本体ごと削除する (他の export からも参照されていない場合)
     - 関数本体は残るが export だけ不要な場合は `export` キーワードを外す
  4. 削除後 `pnpm test` と `pnpm build` を通す。テストが import エラーで落ちる場合
     は、そのテスト自体が dead test なので削除するか、export を復活させる。
  5. 変更ファイルが God Object (GraphViewContainer.ts / PanelBuilder.ts /
     EdgeRenderer.ts / RenderPipeline.ts) に該当する場合は触らないこと。
  完了条件: src/utils/ と src/parsers/ 配下で `ts-prune` の出力が削減されること、
  かつ `pnpm test` と `pnpm build` が成功すること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
