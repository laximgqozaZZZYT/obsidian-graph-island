---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 866-752-subtask
depends: none
summary: subtask
---

## Description (subtask of 866-752-subtask)

このissueは元の記述通り「ファイル1つを pending→done に `git mv` + frontmatter `status` 行書換 + コミット」という原子的操作のため、**1タスクにまとめる**のが自律パイプライン運用上も安全です（中間状態コミットを避ける）。分解ルール上限は5ですが、下限はなく、無理な分解は禁物です。

`★ Insight ─────────────────────────────────────`
- `git mv` は削除+追加を1コマンドで原子的に処理するため、Edit と mv を別サブタスクに分けるとステージング引き渡しが壊れる
- done 化コミットは「完了」というマイルストーンなので、中途半端な状態でのコミットを挟まないほうが履歴が読める
`─────────────────────────────────────────────────`

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
