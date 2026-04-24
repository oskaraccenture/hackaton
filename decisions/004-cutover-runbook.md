# ADR-004: Cutover Runbook — Shifting Album Traffic from Monolith to album-service

**Status:** Accepted  
**Date:** 2026-04-24  
**Depends on:** ADR-001 (Strangler Fig strategy), ADR-003 (service boundary enforcement)

---

## Context

`album-service` (Node.js/Express, `:3001`) is fully operational and passes all contract tests. The legacy monolith (Spring Boot, `:8080`) continues to serve all production traffic. Both services currently use an in-memory database (H2 for monolith, SQLite for album-service) — their data is diverged with no shared backing store.

Before any traffic shift, three prerequisites must be met:

1. An API gateway/façade to route requests to the correct backend without changing the client URL
2. A shared, durable database replacing both in-memory stores (target: PostgreSQL)
3. A verified data migration script that seeds album-service from monolith state without data loss

Without these, a cutover creates split-brain (clients hitting different backends see different data) and has no instant rollback path.

---

## Decision

**Incremental canary cutover over 4 weeks**, gated by automated pass/fail criteria at each stage. No traffic shifts without a verified rollback path. The monolith stays live and takes 100% of traffic until gate criteria at each stage are met.

---

## Cutover Stages

### Stage 0 — Pre-conditions (before Week 1)

- [ ] PostgreSQL instance provisioned and reachable from both services
- [ ] `album-service` configured to connect to Postgres (replace SQLite `db.js`)
- [ ] Data migration script written and tested against a copy of production data
- [ ] API gateway deployed (nginx/Kong/AWS ALB); routes `/api/albums` → monolith by default
- [ ] Characterization test suite integrated into CI pipeline; all tests green against monolith

**Gate:** CI green, gateway routing to monolith, Postgres seeded with migrated data.  
**Rollback:** Remove gateway; clients talk directly to monolith. Zero impact.

---

### Stage 1 — Shadow Mode (Week 1)

Route 0% of live traffic to album-service. The gateway mirrors all `GET /albums*` requests to album-service in parallel (fire-and-forget). Responses from album-service are logged but not returned to clients.

**Gate criteria (all must pass to proceed):**  
- album-service returns HTTP 200 for ≥ 99.9% of mirrored GET requests over 48 hours  
- p99 response time ≤ 150 ms (monolith baseline measured in same window)  
- Zero `BOUNDARY VIOLATION` errors in album-service logs  

**Rollback:** Disable mirroring. No client impact.

---

### Stage 2 — Canary 10% (Week 2)

Route 10% of `GET /albums` and `GET /albums/:id` traffic to album-service. Write endpoints (`POST`, `PUT`, `DELETE`) stay 100% on monolith. Both services write to the shared Postgres instance.

**Gate criteria:**  
- Error rate on album-service ≤ 0.1% over 72 hours  
- p99 latency ≤ monolith p99 + 20 ms  
- All characterization tests green (run hourly in CI against both services)  
- No data inconsistency between monolith and album-service for the same album ID  

**Rollback:** Set gateway weight to 0% for album-service. Takes effect in < 30 seconds.

---

### Stage 3 — Canary 50% + Write Traffic (Week 3)

Route 50% of all album traffic (reads and writes) to album-service.

**Gate criteria:**  
- All Stage 2 criteria hold at 50% load  
- Full contract test suite green against live album-service for ≥ 24 hours  
- Ops team has confirmed Postgres backup schedule and recovery drill completed  

**Rollback:** Set gateway weight to 0%. Monolith absorbs 100% of traffic; Postgres state is consistent because album-service was writing to the same DB.

---

### Stage 4 — 100% Cutover (Week 4)

Route 100% of album traffic to album-service. Monolith album endpoints go dark (return `503` with `Retry-After: 0`; gateway handles this transparently).

**Gate criteria:**  
- All Stage 3 criteria hold at 100% load for 24 hours before declaring stable  
- On-call runbook updated with album-service restart procedure  
- Monolith `/albums*` endpoints disabled but monolith process stays up (serves other endpoints)  

**Rollback within 24 hours:** Re-enable monolith album endpoints; set gateway weight back to monolith. Both backends share the same Postgres, so state is consistent.  
**Rollback after 24 hours:** Requires DB diff and re-sync — treat as an incident.

---

## Rollback Decision Matrix

| Trigger | Action | Time to recover |
|---|---|---|
| album-service error rate > 1% for 5 min | Auto-rollback via gateway health check | < 60 s |
| p99 latency > monolith + 50 ms for 10 min | Manual rollback: set gateway weight to 0% | < 2 min |
| Data inconsistency detected | Stop writes to album-service; rollback; open incident | 15–60 min |
| Contract test failure in CI | Block traffic increase; do not advance stage | — |

---

## What We Chose NOT to Do

- **Hard cutover (big-bang)** — switching 100% of traffic at once gives no rollback window and no data to assess failure rate before it affects all users. The canary approach catches problems at 10% before they become a full outage.

- **Blue-green deployment** — requires two full production environments running simultaneously. Overkill for a single service boundary; cost is not justified. Blue-green makes sense when the entire application topology changes, not a single service extraction.

- **Client-side routing (feature flags in the frontend)** — the AngularJS frontend calls `/albums` directly; adding routing logic to an EOL frontend creates technical debt in the component we intend to retire. Gateway-side routing is invisible to the client and reversible without a frontend deploy.

- **Database cutover before service cutover** — migrating to Postgres while the monolith still serves H2 adds a migration risk layer with no benefit. The shared-Postgres model during Stage 2–4 is safer: both services read the same data, eliminating split-brain.

- **Skipping shadow mode** — mirroring reads before shifting any live traffic costs nothing and surfaces bugs (response shape differences, missing IDs, latency outliers) without user impact.

---

## Consequences

**Positive:**
- Each stage has a defined, testable gate — cutover progress is objectively measurable, not opinion-based
- Rollback at any stage takes < 2 minutes until Stage 4 is declared stable
- Characterization tests used as a live regression gate, not just a one-time snapshot
- Monolith stays live throughout; zero forced downtime

**Negative:**
- 4-week timeline requires sustained operational focus; slipping a stage gate delays the full cutover
- Shared Postgres during transition means a bad migration script affects both services simultaneously
- Gateway is a new infrastructure dependency — it must be highly available before Stage 1 begins
- Shadow mode doubles read load on album-service for 48 hours; size the service accordingly before Stage 1

---

## Success Criteria (end of Stage 4)

| Metric | Target |
|---|---|
| All contract tests | Green |
| Characterization test regressions | 0 |
| album-service p99 latency | ≤ monolith pre-cutover baseline |
| Error rate | ≤ 0.1% over 7-day trailing window |
| Monolith album endpoints | Disabled; gateway returns 503 |
