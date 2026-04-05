---
priority: high
reported: 2026-04-05
status: in-progress
summary: 描画遅い + 初期表示でzoom-to-fit未実行 + 同心円グルーピング不安定
---

## Description

ユーザーから3つの課題が報告されている:

1. **描画が遅い** — 初期読み込みまたは設定変更時のレンダリングが遅い
2. **初期読み込み時に全体表示になっていない** — autoFitView が初期ロード時に正しく動作していない可能性
3. **グルーピング配置: 同心円がうまくいっていないことが多い** — concentric arrangement でノードが期待通りに配置されない

## Acceptance criteria

- [ ] 初期読み込み後に autoFitView が確実に実行され、全ノードが表示される
- [ ] concentric arrangement で適切な同心円配置が行われる（グループが重ならない）
- [ ] 描画パフォーマンスに明らかな劣化がないこと（現状維持以上）
