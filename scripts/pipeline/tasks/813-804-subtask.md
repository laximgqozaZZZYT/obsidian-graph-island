---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 804-769-
depends: none
summary: subtask
---

## Description (subtask of 804-769-)

自律パイプライン向けサブタスク分解です。元issueは既に非常に小さく（exit確認・stdout分割・ログ・受け渡し）、2つに分けるのが適切です。

`★ Insight ─────────────────────────────────────`
- 自律パイプラインのサブタスクは shell/スクリプト層の処理で、プラグイン本体 (`src/`) を変更しないため God Object ポリシー抵触リスクは低い
- ただし CLAUDE.md の `console.*` 禁止は production TypeScript コードに対するもの。パイプラインスクリプト (bash/pipeline-*.sh 等) の `echo`/ログは対象外
- 「受け渡しフォーマット保持」は subtask-1 の stdout を改変せず渡すこと — trimや正規化を入れると git status --short の空行・空白列情報が失われる
`─────────────────────────────────────────────────`

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
