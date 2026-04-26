
## Description
setText()やtextContentに直接文字列を渡している箇所が39個。\nCLAUDE.mdルール: 全user-facing stringsはt()関数を通すこと。

## Acceptance criteria
- [ ] ハードコード文字列を 10 個以下に (t() でラップ)
