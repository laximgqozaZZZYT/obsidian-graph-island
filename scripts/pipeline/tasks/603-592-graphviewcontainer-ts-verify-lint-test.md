---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 592-580-graphviewcontainer-ts-verify
depends: none
summary: GraphViewContainer.ts 行数 verify + lint/test + 空コミット記録
---

## Description (subtask of 592-580-graphviewcontainer-ts-verify)

副作用ゼロの verify タスク。ソースは一切変更しない。

  実行手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在行数を取得し ACTUAL に保存
  2. fail-fast 判定:
     - ACTUAL > 8597 なら即終了し超過量 (ACTUAL - 8597) を報告、commit しない
     - ACTUAL <= 8597 なら次へ進む
  3. スモークテスト:
     - `pnpm lint` を実行、fail なら commit せず終了
     - `pnpm test` を実行、fail なら commit せず終了
  4. 全 pass なら空コミットで記録:
     git commit --allow-empty -m "chore: verify GraphViewContainer.ts within God Object threshold

     wc -l: <ACTUAL>/8597 (Max Allowed)
     lint: pass
     test: pass"
  5. `git log -1 --oneline` と `git status` で記録確認
  6. `git diff HEAD~1 HEAD` が空であることを確認 (ソース変更なし)

  Acceptance criteria:
  - [ ] ACTUAL <= 8597 (超過時は fail-fast で commit なし)
  - [ ] `pnpm lint` / `pnpm test` が pass
  - [ ] 空コミットが HEAD に記録されている
  - [ ] `git diff HEAD~1 HEAD` が空
  - [ ] CLAUDE.md "GOD OBJECT Policy" / "Ratchet down only" に違反しない

  禁止事項:
  - src/views/GraphViewContainer.ts の編集
  - 閾値 (8597) の変更 (Ratchet down only ルール違反)
  - lint/test の skip や `--no-verify` 等のバイパス
```

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
