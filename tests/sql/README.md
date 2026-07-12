# Billing SQL integration tests

Apply all Supabase migrations to an isolated database, create a disposable Auth
user/profile, and run:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v user_id="<test-profile-uuid>" \
  -f tests/sql/credit-ledger.integration.sql
```

The test runs in a transaction and rolls back. Never point it at production.
For contention testing, grant one credit to a disposable user and invoke
`reserve_credits` from two separate database sessions at the same time. Exactly
one call must succeed; the other must raise `INSUFFICIENT_CREDITS`. Follow with
`reconcile_credit_wallet(user_id, false)` and require `mismatch=false`.
