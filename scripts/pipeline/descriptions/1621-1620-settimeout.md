## Description (subtask of 1620-settimeout-leaks)

src/ 配下の `setTimeout(` を全件抽出し、各呼び出しについて以下を分類する:
  - (A) onunload/destroy/dispose で clearTimeout 済み
  - (B) 未クリア（破棄時に動き続ける可能性あり）
  - (C) 即時1回のみで破棄前に必ず完了する短命タイマー(クリア不要)
  分類結果を一時的に各ファイルのコメントに `// timer:A|B|C` で印を付ける(調査用、後続タスクで除去)。
  特に GraphViewContainer.ts のクラスフィールドに格納されていない裸の setTimeout を優先的に列挙する。
  本タスクではコード挙動は変えない(コメントのみ追加)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
