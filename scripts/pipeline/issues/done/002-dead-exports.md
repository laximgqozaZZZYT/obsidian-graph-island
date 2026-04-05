---
priority: medium
reported: 2026-04-05
status: done
source: auto-discovered
summary: 147個のdead exports (使われていないpublic API)
---

## Description
exportされているが、プロジェクト内のどこからもimportされていない名前が147個。\nバンドルサイズ・メンテナンスコストに影響。

## Acceptance criteria
- [ ] dead exports を 50個以下に削減 (削除 or export解除)
