# Legacy Monolith — spring-music Context

This is the original spring-music codebase (Spring Boot, Cloud Foundry). It is the extraction target. Do not modernize inline.

## What lives here

- `src/main/java/org/cloudfoundry/samples/music/` — main application code
  - `domain/Album.java` — the core domain entity (supports MongoDB, JPA, Redis simultaneously via annotations)
  - `repositories/` — `AbstractAlbumRepository` + one implementation per backend
  - `web/AlbumController.java` — REST controller (Spring MVC)
  - `config/` — Spring profiles wiring the correct DB backend at startup
- `src/main/resources/` — static frontend (HTML/JS/CSS), `application.yml`
- `manifest.yml` — Cloud Foundry deployment descriptor (end-of-life target)
- `build.gradle` — Gradle build (Spring Boot 2.x)

## Key coupling points

1. **Multi-DB profile pattern** — `Album.java` carries annotations for JPA, MongoDB, and Redis simultaneously. The active profile (`jpa`, `mongodb`, `redis`, `in-memory`) is selected at startup via `SPRING_PROFILES_ACTIVE`. This is the primary coupling risk.
2. **Cloud Foundry binding** — `manifest.yml` and `spring-cloud-connectors` wire the DB at runtime. Removing CF binding is step one of extraction.
3. **Frontend bundled in JAR** — the AngularJS frontend lives in `src/main/resources/static`. It calls `/albums` directly. A new service must expose the same endpoint shape or the frontend breaks.

## Rules for this directory

- **Do not refactor inline.** Write a characterization test first, then propose an ADR, then extract.
- **Ugliness to focus on:** multi-annotation `Album.java`, CF-coupled config, no interface contract on the REST API.
- **To understand a seam:** trace from `AlbumController` → `AlbumService` → `AbstractAlbumRepository` → specific impl. The DB tables / collections are where the real coupling is.

## How to run

```bash
./gradlew bootRun
# Default profile: in-memory (H2). No external DB needed.
# → http://localhost:8080
```
