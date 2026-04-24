# /extract-service

Extract a business domain from the spring-music monolith into a standalone microservice.

## Usage

```
/extract-service <domain>
```

Example: `/extract-service albums`

## Subagent orchestration

This command runs three sequential subagents. Do not skip phases.

### Phase 1 — Seam analysis (subagent_type: Explore, thoroughness: very thorough)

Spawn an Explore subagent with this prompt:

```
Analyze the spring-music monolith at legacy/src/main/java/ to map the extraction seam for domain "$ARGUMENTS".
Report:
1. All Java classes belonging to this domain (controllers, services, repositories, entities)
2. Database tables / collections / keys touched by those classes
3. Every caller of those classes from outside the domain
4. Spring profiles and VCAP_SERVICES bindings coupled to this domain
5. Fields exposed in HTTP responses — flag Spring annotations (@Document, @Entity, @Column, _class)
Return a structured report; do not write any files.
```

### Phase 2 — Implementation plan (subagent_type: Plan)

Spawn a Plan subagent, passing the Explore report as context:

```
Design the extraction plan for the "$ARGUMENTS" domain from spring-music.
Seam analysis: <Explore output>

Plan must cover:
- Files to create under services/$ARGUMENTS-service/ (package.json, index.js, db.js, routes/, acl/, tests/)
- ACL field mappings: legacy field → clean domain field
- Contract test cases including assertions that no Spring annotation appears in responses
- Whether decisions/001-modernization-strategy.md needs an amendment

Output: numbered file list with one-sentence purpose per file. No code yet.
```

### Phase 3 — Code generation (subagent_type: general-purpose)

Spawn a general-purpose subagent, passing the Plan output as context:

```
Implement the $ARGUMENTS-service. Repo root: /home/oskarc35/workshop/claude-code-hackathon/hackaton
Plan: <Plan output>

Rules (hard constraints — PreToolUse hook will block violations):
- async/await only, no callbacks
- Structured errors: { "error": { "code": "UPPER_SNAKE", "message": "..." } }
- No Spring annotations (@Document, @Entity, @Column, _class) in any route response
- ACL in services/$ARGUMENTS-service/acl/$ARGUMENTSAdapter.js is the only place that knows Spring shapes
- Parameterized SQL — no string concatenation

After writing all files run: cd services/$ARGUMENTS-service && npm install && npm test
Report each test pass/fail.
```

## Rules applied automatically

- camelCase field names in all responses
- No Spring annotations anywhere in service code
- Contract test asserts absence of `_class`, `@Document`, `@Entity` in API responses
- Parameterized queries only (no string concatenation)

## Before running

Ensure characterization tests pass: `cd tests/characterization && ./run.sh`
If they fail, start the monolith first: `cd legacy && ./gradlew bootRun`
