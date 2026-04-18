---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 624-607-4-god-object
depends: none
summary: subtask
---

## Description (subtask of 624-607-4-god-object)

で取得した行数を、以下の表形式で memory に記録する:

    | File | Current | Max Allowed | Status |
    |------|---------|-------------|--------|
    | GraphViewContainer.ts | N | 8597 | PASS/VIOLATION |
    | PanelBuilder.ts | N | 2216 | PASS/VIOLATION |
    | EdgeRenderer.ts | N | 2702 | PASS/VIOLATION |
    | RenderPipeline.ts | N | 2321 | PASS/VIOLATION |

  判定ルール:
    - Current <= Max Allowed → PASS
    - Current > Max Allowed → VIOLATION (超過行数 = Current - Max Allowed を併記)

  memory への保存:
    - 新規ファイル: project_god_object_measurement_2026_04_18.md (type: project)
    - MEMORY.md に1行の index エントリを追加
    - VIOLATION があれば、該当ファイル名・超過行数・Current値を明記
    - 全PASSの場合もCurrent値を記録（将来の ratchet down 検討用）

  修正作業は範囲外 (別issueとして必要なら起票)。コード・テスト変更なし、diffは空のまま完了。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
