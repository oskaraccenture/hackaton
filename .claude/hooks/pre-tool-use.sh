#!/usr/bin/env bash
# PreToolUse boundary enforcement (ADR-003).
# Blocks Write/Edit to services/*/routes/ if Spring annotations are detected.
# Input: $1 = tool name, $2 = file path (for Write/Edit), stdin = content

TOOL="$1"
FILE="$2"

if [[ "$TOOL" != "Write" && "$TOOL" != "Edit" ]]; then
  exit 0
fi

if [[ ! "$FILE" =~ services/.*/routes/ ]]; then
  exit 0
fi

CONTENT=$(cat)

if echo "$CONTENT" | grep -qE '@Document|@Entity|@Column|@RedisHash|spring\.|_class|albumId|release_year|track_count'; then
  echo "BOUNDARY VIOLATION: Spring-era field or annotation detected in service route."
  echo "File: $FILE"
  echo "Translate Spring types via services/album-service/acl/albumAdapter.js first."
  echo "See decisions/003-service-boundary.md"
  exit 1
fi

exit 0
