# Final Policy & Security Consistency Check

Date: 2026-02-19

## Access control
- Admin endpoints (`/admin/*`) require `x-admin-api-key` or `x-api-key`.
- Missing `ADMIN_API_KEY` env returns `503 SERVER_MISCONFIGURED`.
- Invalid or missing key returns `401 UNAUTHORIZED`.

## Restriction policy
- Active sanctions (`SUSPEND_7D`, `SUSPEND_30D`, `BAN`) and `blocked=true` users are denied protected actions with `403 USER_RESTRICTED`.
- BAN enforces both sanction + `blocked=true` update.
- No-show escalation over 90d: `SUSPEND_7D -> SUSPEND_30D -> BAN`.

## Explicit policy exception
- Restricted users may still submit `/appointments/:id/no-show` when tied to an existing appointment (exception path implemented and tested).

## Data validation and integrity
- Input contracts validated with Zod.
- Time window validations and overlap prevention for availability slots.
- Ownership/participant checks for appointment actions.
- Duplicate pending proposal prevention (`409 CONFLICT`).
- Report resolution idempotency guard (`409 CONFLICT` on second resolve).

## Test evidence
- `scripts/e2e-flow.ts`: end-to-end happy path.
- `scripts/integration-guardrails.ts`: authorization, guardrails, sanction escalation, matching quality, admin moderation resolve flow.

Status: ✅ consistent with documented MVP policy scope.
