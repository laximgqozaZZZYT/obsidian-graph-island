## Description (subtask of 1517-autonomous-stalled-dirty-skip)

scripts/pipeline/ 配下の全スクリプトを精読し、scripts/pipeline/issues.csv に
  書き込んでいる箇所を特定する。具体的に確認すること:
  - `git log -p -- scripts/pipeline/issues.csv` で過去の変更履歴 (誰が/どのスクリプトが
    更新するか) を確認
  - `git diff scripts/pipeline/issues.csv` で現状の差分 (どのカラムが書き換わるか) を確認
  - scripts/pipeline/ 配下で `issues.csv` を grep し、書き込み箇所と読み込み箇所を列挙
  - autonomous-improve.sh / 自律ループ起動スクリプトを読み、cycle 開始時の
    "dirty 検知 → SKIP" ロジックの該当行番号を特定
  調査結果を以下の確定情報として README なしのコミットメッセージに記載:
    1) どのスクリプトが書き込んでいるか (ファイル名:行番号)
    2) 書き込み内容が「commit すべきもの」「.gitignore すべきもの」「.local に逃がすべきもの」
       のどれか (現状の運用意図から判定)
    3) 採用する修正方針1案
  このタスクではコード変更は行わず、調査メモを issue ファイルに追記する形でも可。
  ただし issue の status / frontmatter は変更しないこと。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
