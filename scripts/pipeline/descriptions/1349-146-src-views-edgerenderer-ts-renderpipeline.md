## Description (subtask of 146-scattered-constants)

EdgeRenderer.ts と RenderPipeline.ts のトップレベル SCREAMING_CASE 定数を
  精読・列挙する。レンダリング共通の閾値・係数(透明度、ピクセル下限等)で
  ファイル外からも意味を持つものを src/constants.ts に移動する。
  ファイル内クローズドな実装詳細(関数内ローカル相当の private 定数)は
  対象外とする。
  God Object Policy に従い、両ファイルの行数が増えないこと
  (移動分の import 増を含めても元の Max Allowed を超えない) を
  `wc -l src/views/EdgeRenderer.ts src/views/RenderPipeline.ts` で確認する。
  `pnpm build` `pnpm test` `pnpm lint` がすべて通ることを確認してコミット。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
