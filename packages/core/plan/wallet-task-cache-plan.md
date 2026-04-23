# Wallet Task + Session Cache Plan

Updated: 2026-04-23

## Goal

Build wallet operations in task layer, expose commands for ex:lon, and keep UI/CLI as presentation only.

Principles:
- Reuse existing wallet interfaces (`wallet.listKeys`, `wallet.getSigner`, `wallet.deriveConfiguredAddresses`).
- Do not reimplement key derivation/signing logic.
- Store only metadata in session cache; no mnemonic/privateKey plaintext in cache.

## Scope

In scope (phase-by-phase):
1. Task-level session cache module for wallet operations.
2. ex:lon command flow calling task APIs.
3. run layer consuming cache data for follow-up operations (balance/send/query).

Out of scope (initial phases):
- Replacing existing key storage/encryption model.
- Introducing new chain provider model.

## Security Requirements (must follow)

1. No plaintext key export from task responses.
2. Cache stores only safe metadata:
   - keyId/keyName/source/status
   - chain/address/name/path/addressType
3. Task output must be sanitized and avoid sensitive fields.
4. High-risk operations require explicit confirmation at command layer.
5. AI source should be controlled by sourcePolicy and task allowlist.

## Architecture

Layers:
1. Task layer (`src/tasks/wallet`) handles state mutation and cache APIs.
2. Session cache layer stores in-memory session state with indexes.
3. UI/CLI layer only reads cache or calls task actions.
4. run layer uses cache for operational workflows.

Data model (session cache):
- Session
  - sessionId
  - keys: Map<keyId, KeyMeta>
  - addresses: Map<addressId, AddressMeta>
  - indexes:
    - byName: nameLower -> addressId[]
    - byAddress: chain:addressLower -> addressId
    - byKey: keyId -> addressId[]
  - stats
  - updatedAt

## Task Contract (initial)

Single task entry in phase 1:
- task id: `wallet:session`
- action-based input:
  - `cache.list`
  - `cache.clear`
  - `cache.syncUnlocked`
  - `cache.importConfigured`
  - `cache.remove`

This keeps wallet task implementation in one inspectable module first, then split by action later if needed.

## Step Plan

### Phase 1 (now)
- Add `src/tasks/wallet/session-cache.mjs` (in-memory cache and indexes).
- Add `src/tasks/wallet/index.mjs` using defineTask and existing wallet interfaces.
- Add minimal tests for task action behavior.

### Phase 2
- Add ex:lon command bindings for wallet session task.
- Replace ad-hoc logic in `src/run/test.mjs` with cache-first calls.

### Phase 3
- Add policy controls for AI source and confirmation levels.
- Add optional TTL/expiration for session cache.

## Acceptance Criteria

1. `wallet:session` can sync unlocked keys without leaking secrets.
2. `wallet:session` can import configured addresses and index them.
3. UI/CLI can render from cache output without touching key plaintext.
4. run layer can resolve address by name/address from cache.

## Notes

- Keep interfaces stable and additive.
- Prefer compatibility wrappers over breaking existing wallet APIs.
