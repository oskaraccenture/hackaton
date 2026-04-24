# /extract-service

Extract a business domain from the spring-music monolith into a standalone microservice.

## Usage

```
/extract-service <domain>
```

Example: `/extract-service albums`

## What this command does

1. **Analyze the seam** — reads `legacy/src/main/java/.../` and identifies:
   - Classes belonging to `<domain>` (repositories, controllers, services)
   - Database tables / MongoDB collections / Redis keys touched
   - All callers of domain classes
2. **Identify coupling points** — lists Spring profiles and CF bindings that bind to this domain
3. **Generate the service skeleton** in `services/<domain>-service/`:
   - `package.json`
   - `index.js` (Express app, health endpoint)
   - `db.js` (SQLite in-memory, parameterized queries)
   - `routes/<domain>.js` (clean REST API, camelCase)
   - `acl/<domain>Adapter.js` (Spring model → domain model translation)
   - `tests/contract.test.js` (no Spring fields in responses)
4. **Write the ACL** — maps Spring-era field names to clean domain names
5. **Update ADR-001** — adds an extraction record

## Rules applied automatically

- camelCase field names in all responses
- No Spring annotations anywhere in service code
- Structured errors: `{ "error": { "code": "UPPER_SNAKE", "message": "..." } }`
- Parameterized queries only (no string concatenation)
- Contract test asserts absence of `_class`, `_id`, Spring annotation strings

## Before running

Ensure characterization tests pass: `cd tests/characterization && ./run.sh`
If they don't pass, the monolith isn't running — start it first: `cd legacy && ./gradlew bootRun`
