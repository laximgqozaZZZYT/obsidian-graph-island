---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 561-559-graphviewcontainer-ts-verify
depends: none
summary: GraphViewContainer.ts 行数 verify + lint/test + 空コミット
---

## Description (subtask of 561-559-graphviewcontainer-ts-verify)

verify-only 操作。ファイル内容は一切変更しない。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` を実行して現在の行数を取得
  2. CLAUDE.md GOD OBJECT Policy の Max Allowed = 8597 と比較
  3. 8597 超過なら fail-fast: 超過行数と増加セクションを報告して即中断 (コミットしない)
  4. 8597 以下なら:
     - `pnpm lint` を実行し PASS 確認
     - `pnpm test` を実行し PASS 確認 (vitest, 2570+ tests)
     - `git commit --allow-empty -m "chore: verify GraphViewContainer.ts line count within 8597 limit"` で監査証跡の空コミットを記録
  5. 完了報告に「現在の行数 / Max Allowed = 8597」を明記

  制約:
  - src/views/GraphViewContainer.ts を含む全ファイルの変更禁止 (verify のみ)
  - Max Allowed の引き上げ禁止 (ratchet policy 厳守)
  - lint または test が FAIL した場合は fail-fast で中断、コミットしない
  - pnpm を使用 (npm ではない)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
