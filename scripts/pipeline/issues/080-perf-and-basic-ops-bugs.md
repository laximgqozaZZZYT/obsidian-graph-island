---
priority: critical
reported: 2026-04-11
status: pending
summary: パフォーマンスが重く基本操作にバグが多い — E2Eテストで検出・修正せよ
---

## Description

ユーザー報告: プラグインがまだ重い。基本操作ですらバグが多い。

以下の手順で対応すること:
1. E2Eテスト (cdp-smoke + cdp-e2e 全スイート) を実行し、失敗するテストを全て特定
2. 失敗の根本原因を調査・修正
3. パフォーマンスに関連する問題があれば合わせて修正
4. 修正後に全E2Eテストがグリーンであることを確認

聞き返し禁止。自律的にE2Eテストを実行し、検出されたバグを修正すること。

## Acceptance criteria

- [ ] `npx playwright test --config e2e/cdp-smoke.config.ts` が全テスト pass
- [ ] `npx playwright test e2e/cdp-e2e-*.spec.ts` が全テスト pass (CDP接続可能な場合)
- [ ] 検出されたバグの修正コミットが enforce-gates を通過
- [ ] パフォーマンスに影響する不要な再描画・再計算があれば除去
- [ ] 修正内容のサマリをコミットメッセージに記載
