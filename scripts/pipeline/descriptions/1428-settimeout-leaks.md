## Description
setTimeoutがclearTimeoutより18個多い。コンポーネント破棄時にメモリリークの原因。

## Acceptance criteria
- [ ] 未クリアsetTimeoutを 10 個以下に
