---
priority: high
reported: 2026-04-15
status: in-progress
source: decomposed
parent: 133-type-assertions
depends: none
summary: DOM型キャストの型ガード化（`as HTML*Element` 約30箇所除去）
---

## Description (subtask of 133-type-assertions)

DOM要素取得時の `as HTMLElement` / `as HTMLInputElement` 等を型安全パターンに置換。
  1. `querySelector<HTMLInputElement>(...)` ジェネリック形式に置換（querySelectorは型パラメータをサポート）
  2. `e.target as HTMLElement` → instanceof型ガードに置換（`if (e.target instanceof HTMLElement)`）
  3. `containerEl.children[N] as HTMLElement` → nullチェック付き型ガードに
  4. 注意: GVC（8612行上限）は行数を増やさない。型ガードは既存行のインライン置換のみ
  5. 不可避なDOM境界キャスト（約27箇所）はそのまま残す
  想定除去数: ~30

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
