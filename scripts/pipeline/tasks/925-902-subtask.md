---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 902-895-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: subtask
---

## Description (subtask of 902-895-graphviewcontainer-ts-claude-md-ratchet)

このissueは**再分解禁止**が明示されているため、分解しません。

## 理由

元のissueのdescription冒頭に明記:
> 単一セッション・単一コミットで完結（再分解禁止）。

かつ、作業内容もサブタスクに分ける意味がありません:
- コード変更なし（メタデータのみ）
- `wc -l` 測定 → CLAUDE.md 1行編集 → frontmatter更新 → `git mv` → 1 commit
- 全手順が1つの claude -p セッション（max-turns 30）で余裕で完了する粒度

```
★ Insight ─────────────────────────────────────
・ratchet タスクは「測定と記録」だけで、失敗パスも含め全分岐が <10 ツール呼び出しで完結する典型例
・分解するとコミット分割や中間状態（測定だけ済んだがCLAUDE.md未更新）のリスクが発生し、原子性が崩れる
・「再分解禁止」が明示されたissueは、親タスクで意図的に最小単位に切られた結果なので尊重すべき
─────────────────────────────────────────────────
```

## 推奨アクション

このissueはそのまま autonomous pipeline の単一ワーカーに流してください。分解ファイルは作成不要です。

もし pipeline 側で強制的に decompose フェーズを通す必要があるなら、「

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
