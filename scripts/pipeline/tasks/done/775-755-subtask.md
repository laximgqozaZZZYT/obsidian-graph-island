---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 755-729-read-frontmatter
depends: none
summary: subtask
---

## Description (subtask of 755-729-read-frontmatter)

で取得したコンテンツの frontmatter 以降の本文に対し Grep ツールで
  `^## Description` と `^## Acceptance criteria` の両行が存在するか検証。
  どちらかが欠落していれば `WARN: missing section: <section>` をログ出力し abort。
  両方存在する場合のみ「検証合格」ログを出して正常終了。コード変更なし。

`★ Insight ─────────────────────────────────────`
- 検証専用サブタスクは read-only で副作用ゼロに保つと、autonomous pipeline のロールバック不要で安全
- frontmatter と本文セクションを別サブタスクに分けると、どちらの段階で弾かれたか WARN ログで即特定できる
- `depends` 鎖を直列にすることで、前段失敗時に後段が走らず「誤ファイル混入」の連鎖誤動作を防げる
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
