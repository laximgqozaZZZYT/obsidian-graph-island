## Description (subtask of 1490-type-assertions)

GraphViewContainer.ts (8652行, God Object) に集中している81件の型アサーションを
  50件以下まで削減する。**新しい行を追加せず、既存行の置換のみで行うこと。**
  God Object を肥大化させない (Max Allowed: 8655)。
  
  主なパターン:
    - `... as ExportManager.ExportHost` (7件) → ExportManager 側で受入型を緩めるか、
      ExportHost 型をクラス本体で `implements` して恒久的に解消する。
    - `... as Record<string, ...>` (7件) → 該当オブジェクトの型を Record 型で
      宣言時に固定すればアサーション不要。
    - `... as Set<string>` などは、宣言時の型注釈で吸収する。
    - `panel as unknown as ...` 系は

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
