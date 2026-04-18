---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 938-926-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: subtask
---

## Description (subtask of 938-926-graphviewcontainer-ts-claude-md-ratchet)

このissueは **再分解禁止** と明記された原子的タスクです。分解せず、そのまま単一セッションで実行すべきです。

## 理由

issue本文に以下の明示的制約があります:

1. **「単一セッション・単一コミットで完結させる原子的タスク。再分解禁止。」** — description冒頭に明記
2. **「複数コミット禁止」** — 厳守制約
3. 作業内容は3ステップのみ (行数測定 → 分岐処理 → 単一コミット) で、claude -p max-turns 30 で十分完了可能
4. `src/` 編集禁止、`pnpm build`/`pnpm test` 不要のメタデータ専用タスク

## 推奨アクション

分解せず、以下のいずれかで実行:

```

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
