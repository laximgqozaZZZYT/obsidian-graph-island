---
priority: medium
reported: 2026-04-15
status: decomposed
source: auto-discovered
summary: 57個のdead exports (使われていないpublic API)
---

## Description
exportされているが、プロジェクト内のどこからもimportされていない名前が57個。\nバンドルサイズ・メンテナンスコストに影響。

## Acceptance criteria
- [ ] dead exports を 50個以下に削減 削除orExport解除
