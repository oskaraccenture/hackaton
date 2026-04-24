# /write-adr

Write an Architecture Decision Record for a decision made during the hackathon.

## Usage

```
/write-adr <title>
```

Example: `/write-adr database-per-service-split`

## Subagent orchestration

This command runs two sequential subagents.

### Phase 1 — Context gathering (subagent_type: Explore, thoroughness: medium)

Spawn an Explore subagent with this prompt:

```
Gather context for writing an ADR titled "$ARGUMENTS". Repo root: /home/oskarc35/workshop/claude-code-hackathon/hackaton

Read:
1. All existing ADRs in decisions/ — identify any that this new ADR builds on or supersedes
2. CLAUDE.md architecture guidance relevant to "$ARGUMENTS"
3. Any user stories in stories/ that constrain this decision
4. Relevant source files (services/, legacy/) that illustrate the current state

Return a structured context report with: existing decisions, constraints from stories, and current code state.
Do not write any files.
```

### Phase 2 — ADR authoring (subagent_type: general-purpose)

Spawn a general-purpose subagent with this prompt:

```
Write an ADR for "$ARGUMENTS". Repo root: /home/oskarc35/workshop/claude-code-hackathon/hackaton
Context: <Explore output>

Determine the next sequence number by counting files in decisions/ and increment by 1.
Create decisions/00N-$ARGUMENTS.md with ALL of these sections:

# ADR-00N: <Title>

**Status:** Accepted
**Date:** <today>

## Context
<what problem prompted this decision — be specific, reference code or endpoints>

## Decision
<what we decided — one clear statement>

## Rationale
<why, with explicit comparison to at least 2 alternatives>

## What we chose NOT to do
<MANDATORY — at least 2 rejected alternatives with concrete reasons>

## Consequences
### Positive
### Negative

Rules:
- "What we chose NOT to do" section is mandatory — judges look for this
- Include concrete thresholds ("< 5ms", "more than 3 retries") where relevant
- No vague language: "significant", "appropriate", "better" without definition
- Link to existing ADRs by filename if this depends on or supersedes one
```
