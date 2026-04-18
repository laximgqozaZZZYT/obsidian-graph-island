---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 580-568-graphviewcontainer-ts-verify
depends: none
summary: GraphViewContainer.ts の行数を verify し、閾値内なら空コミットで記録
---

## Description (subtask of 580-568-graphviewcontainer-ts-verify)

副作用ゼロの verify タスク。ソースコードを一切変更しない。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在行数を取得し変数 ACTUAL に格納
  2. fail-fast 判定:
     - ACTUAL > 8597: 即座に終了し、超過量 (ACTUAL - 8597) を報告。commit しない。
     - ACTUAL <= 8597: 次ステップへ
  3. スモークテスト:
     - `pnpm lint` を実行し pass を確認
     - `pnpm test` を実行し pass を確認
     - どちらか fail なら commit せず終了し、失敗内容を報告
  4. 全 pass なら空コミットで記録:
     ```
     git commit --allow-empty -m "chore: verify GraphViewContainer.ts within God Object threshold

     wc -l: <ACTUAL>/8597 (Max Allowed)
     lint: pass
     test: pass"
     ```
  5. `git log -1 --oneline` と `git status` で記録確認

  Acceptance criteria:
  - [ ] ACTUAL <= 8597 (超過時は fail-fast で commit なし)
  - [ ] `pnpm lint` / `pnpm test` が pass
  - [ ] 空コミットが HEAD に記録されている
  - [ ] `git diff HEAD~1 HEAD` が空 (ソース変更なし)
  - [ ] CLAUDE.md "GOD OBJECT Policy" / "Ratchet down only" に違反しない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
