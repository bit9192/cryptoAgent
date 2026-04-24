# Assets Engine Stage 1 Progress

Updated: 2026-04-24

## Current Progress

- Step 1 (EVM metadata): done
- Step 2 (EVM balance batch + multicall): done
- BTC asset batch query: done
- TRX asset query (metadata/balance single+batch): done
- Step 4 (assets-engine aggregate): done (MVP)
- Step 5 (tasks/assets status/query): in progress (MVP implemented)

## This Iteration Scope

Implemented in this slice:

- modules/assets-engine/snapshot-aggregate.mjs
- tasks/assets/index.mjs
- Initial APIs:
  - aggregateAssetSnapshot(options)
  - assets.status / assets.query (task orchestration)
- Focus behaviors:
  - valueUsd null when missing price
  - duplicate row merge by chain+owner+token
  - stable sorting when values are equal
  - single-chain query orchestration for evm/btc/trx

Not implemented in this slice:

- offchain provider manager integration
- tasks/assets orchestration
- CLI assets command exposure
- advanced filters/ranking DSL

## Next Step

- Step 3/4 integration pass:
  - Wire offchain normalized price/risk adapters into aggregate inputs
  - Add extra edge/security tests for snapshot output
- Step 6:
  - add cli assets sub-command exposure and workflow tests
