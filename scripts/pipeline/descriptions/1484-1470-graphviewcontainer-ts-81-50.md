## Description (subtask of 1470-type-assertions)

GraphViewContainer.ts に 81 件の `as` キャストが集中している。God Object
  ファイルだが、「Max Allowed = 8655」を超えない範囲での内部修正は許可。
  
  以下を削減対象とする (新規ファイル抽出は禁止、既存ファイル内のリファクタのみ):
  1. ローカル変数の `const x = something as T` → 変数を宣言時に型注釈し
     `as` を削除 (例: `const map: Record<string, X> = {} as Record<string, X>`
     → `const map: Record<string, X> = {}`)
  2. `getPanelState() as PanelState` のような既に正しい型を返す関数呼び出しの
     後の冗長キャストを削除
  3. `(x as any).y` パターンは型ガード関数 (例: `hasOwn(x, "y")`) に置換、
     または該当オブジェクトのインタフェースに `y` を追加
  4. `(event.target as HTMLInputElement).value` は `event.target instanceof
     HTMLInputElement` の type guard に置換
  
  目標: 81 → 30 以下 (50 件以上削除)。ファイル行数が「Max Allowed 8655」を
  超えないこと、`pnpm tsc --noEmit` 通過、`pnpm test` 通過、`pnpm lint` 通過、
  既存の振る舞いを変えないこと (git diff で関数ロジック非変更を確認)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
