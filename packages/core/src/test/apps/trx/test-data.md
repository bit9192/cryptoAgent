## trx multicall metadata batch

### happy

- mainnet multicall contract: TYPACdASdAe4ZjcACwHscmqy6KCssP2jDt
- token A: TVjsyZ7fYF3qLF6BQgPmTEZy1xrNNyVAAA
  - name: Token A
  - symbol: TKA
  - decimals: 6
- token B: TVjsyZ7fYF3qLF6BQgPmTEZy1xrNNyVBBB
  - name: Token B
  - symbol: TKB
  - decimals: 18

### edge

- multicall partial failure: token B call returns success=false
- non-mainnet network: nile should bypass multicall and keep single-call path

### invalid

- bad token address should keep batch row ok=false
- multicall call throws should downgrade to single-call path