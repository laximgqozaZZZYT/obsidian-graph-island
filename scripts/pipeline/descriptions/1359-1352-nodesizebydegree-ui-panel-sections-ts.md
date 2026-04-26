## Description (subtask of 1352-broken-node-settings-cleanup)

panel-sections.ts:21-30 と panel-sections-node-display.ts:203-212 に
  同じ `display.nodeSizeByDegree` トグル UI が 2 箇所で定義されている。
  どちらか 1 箇所のみを残すべき。
  - 呼び出し元を Grep で特定する
    (`grep -rn "panel-sections" src/ | grep import` 等)
  - ノード表示セクション (panel-sections-node-display.ts) を正規化先とし、
    panel-sections.ts:21-30 の重複ブロックを削除
  - 削除に伴い不要になった import / ヘルパーがあれば整理
  - PanelBuilder からどちらが呼ばれているかを確認し、
    呼び出し漏れがないことを確かめる
  god object (PanelBuilder.ts) は変更しない。
  panel-sections*.ts のみで完結させる。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
