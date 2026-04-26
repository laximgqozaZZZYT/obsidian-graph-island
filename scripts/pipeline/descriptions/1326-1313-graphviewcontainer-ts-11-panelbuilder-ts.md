## Description (subtask of 1313-i18n-hardcoded-strings)

目的: 既存行の置換のみで GVC (8655行/Max 8655) の行数を増やさずに 17 箇所を削減する。

  実装 (`src/views/GraphViewContainer.ts` 11 箇所):
  - L1616 `deleteBtn.textContent = "\u00d7"` → setSymbolText
  - L2143 fps 表示 `${currentFps} fps · ${lastFrameMs}ms` → setUserDataText (フォーマット文字列、単位 fps/ms はそのまま保持)
  - L2254 `el.textContent = lines.slice(0, 120) + ...` → setUserDataText
  - L2578 `densityCulledBadgeEl.textContent = text` → setUserDataText
  - L3074 `bodyEl.textContent = ...` (本文プレビュー) → setUserDataText
  - L4096 cluster tip `→ ${clusterName}\n${displayNames}...` → setUserDataText
  - L5974 `zoomIndicatorEl.textContent = pct + labelInfo` → setUserDataText
  - L6303 `statusEl.textContent = t` → setUserDataText
  - L7765 `_ariaLiveEl.textContent = ""` → setUserDataText(el, "")
  - L7767 `_ariaLiveEl.textContent = msg` → setUserDataText
  - L8533 `_sunburstTooltipEl.textContent = lines.join("\n")` → setUserDataText
  必ず import 文を追加し、各置換は 1 行→1 行で行数を維持(import 追加分を相殺するため、既存 import 行に追記または既に dom-helpers 系の import があれば末尾追加)。

  実装 (`src/views/PanelBuilder.ts` 6 箇所):
  - L642 `searchClearBtn.textContent = "\u00d7"` → setSymbolText
  - L652 `searchCountBadge.textContent = `${pixiNodes.size}/${nodeCount}`` → setUserDataText
  - L765 `item.textContent = query` → setUserDataText
  - L825 `searchCountBadge.textContent = `${filtered}/${nodeCount}`` → setUserDataText
  - L947 `settingsFilterClearBtn.textContent = "\u00d7"` → setSymbolText
  - L1551 `popup.textContent = helpText` → setUserDataText

  検証: `pnpm test`, `pnpm build`, `bash scripts/check-gvc-lines.sh` で行数 ≤ 8655 確認、検出 grep の結果が 17→0 で計 17 件減少。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
