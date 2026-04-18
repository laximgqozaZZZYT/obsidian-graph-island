---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 625-609-subtask
depends: none
summary: GraphViewContainer 関連テストの実行と結果記録
---

## Description (subtask of 625-609-subtask)

`pnpm test` をプロジェクト全体で実行し、GraphViewContainer 関連テストが
  全て PASS することを確認する。

  手順:
  1. `pnpm test 2>&1 | tee /tmp/test-gvc.log` で全ユニットテスト実行
  2. ログから `GraphViewContainer` を含むテストファイル一覧を抽出
     (例: `grep -i "GraphViewContainer" /tmp/test-gvc.log`)
  3. FAIL が 1 件でもあれば親 issue (609-595) に戻してブロック報告
  4. PASS の場合、結果サマリ(テストファイル数・テスト件数)を
     issue の「## Verification Result」節として追記してコミット

  禁止事項:
  - テストコード本体を修正しない (これは検証タスク)
  - `pnpm test -- GraphViewContainer` のような絞り込み実行のみで完了しない
    (プロジェクト全体の PASS を確認する必要がある)

  Acceptance:
  - [ ] `pnpm test` が全 PASS
  - [ ] GraphViewContainer 関連テストファイルがログに存在する
  - [ ] issue に結果サマリが追記されている

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
