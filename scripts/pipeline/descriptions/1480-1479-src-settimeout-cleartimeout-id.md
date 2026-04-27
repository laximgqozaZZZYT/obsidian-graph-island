## Description (subtask of 1479-settimeout-leaks)

src/ 配下を grep して setTimeout / clearTimeout の呼び出し箇所を全件抽出する。
  各 setTimeout 呼び出しについて以下の3パターンに分類する:
    A) ID をフィールドや変数に保持し、対応する clearTimeout が存在する (修正不要)
    B) ID を捨てている (戻り値を変数に代入していない、または保持しても解放していない)
    C) ローカル変数で完結し漏れる可能性がない (短時間の自己完結タイマー)
  src/views/GraphViewContainer.ts を最初に精査する (god object かつ View ライフサイクルを持つため最有力)。
  抽出結果を

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
