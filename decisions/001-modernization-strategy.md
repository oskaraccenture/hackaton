# ADR-001: Modernization Strategy — Strangler Fig over Big-Bang Rewrite

**Status:** Accepted  
**Date:** 2026-04-24

---

## Context

Spring Music runs on Spring Boot 2.x, deployed to Cloud Foundry via `manifest.yml`. Cloud Foundry is end-of-life for most enterprise clients. The board wants "modernization." The primary pain points are:

1. Cloud Foundry lock-in — the app can only be deployed via CF service bindings
2. Multi-database coupling — `Album.java` carries JPA, MongoDB, and Redis annotations simultaneously; the active backend is resolved at startup via Spring profiles, making the data model non-portable
3. Bundled frontend — the AngularJS frontend is compiled into the JAR; frontend and backend cannot be deployed independently
4. No explicit API contract — `AlbumController` has no OpenAPI spec; consumers depend on observed behavior

Three strategies were evaluated:

| Strategy | Description |
|---|---|
| Big-Bang Rewrite | Rewrite everything from scratch, run in parallel, hard cutover |
| Lift-and-Shift | Re-deploy to Kubernetes/container unchanged |
| Strangler Fig | Extract one service at a time; monolith stays live |

---

## Decision

**Strangler Fig.** First extraction: Album CRUD domain → `services/album-service`.

---

## Rationale

**Why not Big-Bang Rewrite:**
- No business continuity during the rewrite period
- Requires understanding the full domain before building — the multi-DB abstraction hides behavior we don't fully know yet
- High failure rate for monoliths of this type

**Why not Lift-and-Shift:**
- Moves the CF dependency to a container but solves nothing architectural
- The multi-annotation `Album.java` problem and the bundled frontend remain
- Creates false confidence that modernization is done

**Why Strangler Fig:**
- Monolith stays live throughout — zero big-bang risk
- Each extracted service is independently deployable and independently testable before any traffic shift
- Characterization tests pin monolith behavior as the baseline; any regression is caught before it reaches production
- The multi-DB coupling and the CF dependency can be addressed incrementally per service

---

## What We Chose NOT to Do

- **Event sourcing** — adds significant complexity for a CRUD domain; no business case identified
- **GraphQL** — would require schema design upfront for the full domain; REST is sufficient and matches the existing frontend contract
- **Database-per-service from day one** — starting with a shared in-memory backend; database split follows after service boundaries are proven stable
- **Rewrite the frontend** — the AngularJS frontend is a separate concern; it calls `/albums` and as long as the contract holds, it keeps working

---

## Consequences

**Positive:**
- `album-service` is independently deployable today
- Anti-corruption layer prevents legacy Spring annotations from reaching the new API
- Characterization tests provide a regression safety net for any future monolith changes

**Negative:**
- Two codebases to maintain during the transition period
- Shared in-memory DB is a temporary coupling — must be resolved before a production deployment
- The monolith continues to accumulate entropy while the extraction is in progress

---

## Extraction Order (by risk)

| Seam | Extraction Risk | Reason |
|---|---|---|
| Album CRUD | Low | Self-contained, clear boundary, already has REST controller |
| Storage backend selection | Medium | Tied to CF service bindings; requires infra work |
| Frontend | Medium | Separate deployment needed, AngularJS EOL |
| User management | High | Not fully implemented in legacy; unclear requirements |
