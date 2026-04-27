## Description (subtask of 1408-type-assertions)

1. `grep -rn " as " src/views/ | grep -v "// " | wc -l` で現在件数を測定、ファイル別に分布を grep で確認
  2. 上位ヒット箇所の as-cast を以下のいずれかで置換:
     - `as unknown as T` → `T` 型の正しいシグネチャを定義
     - `obj as Record<string, X>` → 型ガード関数 (例: `isStringRecord(obj)`) を src/types.ts もしくは新規 src/type-guards.ts に追加し if 分岐
     - DOM 系 (`el as HTMLInputElement`) → `instanceof HTMLInputElement` チェック
     - 列挙値 (`s as ViewMode`) → `isViewMode(s)` ガード + フォールバック
  3. GOD OBJECT 4ファイルの行数増加禁止 — 型ガード本体は新規ファイル (src/type-guards.ts) に置く
  4. `pnpm build && pnpm test && pnpm lint` 全グリーン確認
  5. このタスク完了時点での残 as-cast 総数を grep で再測定し commit message に記載

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
