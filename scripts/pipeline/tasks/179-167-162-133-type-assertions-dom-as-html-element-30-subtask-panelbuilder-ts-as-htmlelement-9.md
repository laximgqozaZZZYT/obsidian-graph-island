---
priority: medium
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 167-162-133-type-assertions-dom-as-html-element-30-subtask
depends: none
summary: PanelBuilder.ts の as HTMLElement 型アサーション9箇所を型ガードに置換（行数増加禁止）
---

## Description (subtask of 167-162-133-type-assertions-dom-as-html-element-30-subtask)

God Object（2218行上限）。行数を増やさない修正戦略:
  
  - L1142-1143, L1151, L1153, L1156: 検索フィルタ内の5箇所 → querySelectorAll<HTMLElement> ジェネリクス指定でキャスト不要に
  - L1698: querySelectorAll結果 as HTMLElement[] → querySelectorAll<HTMLElement> に変更
  - L1763: (e.target as HTMLElement).tagName → instanceof ガード（1行置換）
  - L1886-1888: (row as HTMLElement) 3箇所 → ループ前の instanceof + continue（行数同等）
  - L1894-1895: querySelector as HTMLElement → instanceof ガード
  - L2060: (e.target as HTMLElement).closest → instanceof ガード

  重要: wc -l で修正前後の行数を確認し、2218行を超えないこと。
  pnpm test && pnpm lint で確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
