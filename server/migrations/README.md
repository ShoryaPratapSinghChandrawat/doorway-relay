# SQLite migrations

Migration filenames must start with a monotonically increasing integer and end in `.sql`. `server/src/db/migrate.ts` applies each unapplied file once inside a transaction and records its version. Do not edit an already released migration; add a new file.

- `001_initial.sql` creates the users/sessions, source events, handoffs, append-only activity, webhook receipts, Ring token, and integration-state tables.
- `002_handoff_invariants.sql` makes source-event linkage immutable and guards status/owner/acknowledgement/resolution invariants even if a future caller bypasses the domain service.
- `003_ring_token_claim_state.sql` records the Ring account associated with an exchanged token pair and whether the partner account has claimed it.

SQLite is the only application database.
