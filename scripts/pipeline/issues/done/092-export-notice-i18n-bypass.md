---
priority: medium
reported: 2026-04-11
status: done
source: kaizen
summary: ExportManager と StatsRenderer の Notice 文字列が i18n t() を経由していない
---
## Description
CLAUDE.md の規約「All user-facing strings through `src/i18n.ts` `t()` function」に違反し、
エクスポート系の `Notice` メッセージがハードコード英語文字列を直接使用している。

該当箇所:
- `src/views/ExportManager.ts:102` — `new Notice("Graph exported as PNG", ...)`
- `src/views/ExportManager.ts:111` — `new Notice(\`Graph exported: ${...} nodes, ${...} edges\`, ...)`
- `src/views/ExportManager.ts:119` — `new Notice(\`CSV exported: ${...} nodes, ${...} edges\`, ...)`
- `src/views/ExportManager.ts:129` — `new Notice(\`Mermaid diagram copied to clipboard (${...} nodes)\`, ...)`
- `src/views/StatsRenderer.ts:76` — `new Notice("Stats copied as Markdown", 2000)`

これらは UI 上でユーザーに直接表示される Toast 通知であり、
i18n 対応済みの他の Notice (`t("export.svgCopied")` 等) と一貫していない。

## Acceptance criteria
- [ ] 上記5箇所の文字列を `src/i18n.ts` に i18n キーとして追加する
- [ ] `Notice` 呼び出しを `t()` 経由に変更する
- [ ] 動的な値（ノード数等）は `t()` のテンプレート補間を使用する
