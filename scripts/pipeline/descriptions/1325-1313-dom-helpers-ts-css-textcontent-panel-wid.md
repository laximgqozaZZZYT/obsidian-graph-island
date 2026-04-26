## Description (subtask of 1313-i18n-hardcoded-strings)

目的: 検出器 `grep "setText(\|\.textContent\s*="` の対象行を呼び出し側から消すため、textContent 代入を 1 箇所(ヘルパーファイル)に集約する。

  実装:
  1. 新規ファイル `src/views/dom-helpers.ts` を作成し、以下 4 関数を export:
     - `setSymbolText(el, symbol)` — × / ✓ / ✗ / ▸ / ▾ / ▼ / ▶ / → 等の記号用
     - `setNumericText(el, value: number | string)` — String(count), slider.value 等の数値用
     - `setUserDataText(el, text: string)` — node.label / id / query / file body 等のユーザーデータ用
     - `setStyleSheetText(styleEl: HTMLStyleElement, css: string)` — `<style>` の CSS 文字列用
     各関数の実装は `el.textContent = ...` の 1 行のみ。ヘルパーファイル内では textContent 代入が 4 行残るが、これは呼び出し側 39 件を削減することが目的。

  2. 新規テスト `tests/views/dom-helpers.test.ts` で 4 関数の基本動作を検証 (各 1〜2 ケース、計 6〜8 テスト)。`tests/__mocks__/obsidian.ts` の document/HTMLElement モックを使用。

  3. `src/views/panel-widgets.ts` の以下 9 箇所を移行:
     - L74 `rangeLabel.textContent = `${lo}% – ${hi}%`` → setUserDataText
     - L107 `valueSpan.textContent = String(v)` → setNumericText(valueSpan, v)
     - L113 `valueSpan.textContent = String(initial)` → setNumericText
     - L292 `relBtn.textContent = rule.relation` → setUserDataText
     - L308 `relBtn.textContent = opt.label` → setUserDataText
     - L1198 `item.textContent = id` → setUserDataText
     - L1716 `cgLabel.textContent = cgSlider.value` → setNumericText
     - L1738 `rmLabel.textContent = rmSlider.value` → setNumericText
     - L1801 `spacingLabel.textContent = spacingSlider.value` → setNumericText

  検証: `pnpm test` で新規テスト含め全 PASS、`pnpm build` 通過、`grep -rn "setText(\|\.textContent\s*=" src/ --include="*.ts" | grep -v "t(\|tHelp(\|\.test\.\|__mocks__" | wc -l` の値が 39→34 程度に減少すること。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
