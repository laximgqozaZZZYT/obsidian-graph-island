## Description (subtask of 1617-dead-exports)

1. まず検出方法を確認: pnpm scripts に dead-export 検出系があるか、なければ
     `pnpm dlx ts-prune` または `pnpm dlx knip` で 146 個のリストを生成し、
     対象ファイルを src/utils/ と src/parsers/ 配下に絞り込む。
  2. リスト中の各 export について以下のいずれかを実施:
     - tests/ からも参照なし → export 宣言ごと削除（関数/型/定数本体も削除）
     - tests/ からのみ参照 → 公開維持（テスト用として正当）。リストに記録のみ
     - 同一ファイル内のみで参照 → `export` キーワードを外して内部関数化
  3. 変更後 `pnpm test` `pnpm lint` `pnpm format:check` `pnpm build` を全てパスさせる。
  4. CLAUDE.md の「ratchet down only」に従い、削除した export 数を本タスクの commit
     メッセージに記載 (例: "remove 32 dead exports from utils/parsers")。
  5. 削除した export がテストからも参照されている場合は、そのテストが本当に意味のある
     カバレッジを生んでいるか確認し、テストもろとも削除して問題ないかをコメントで報告。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
