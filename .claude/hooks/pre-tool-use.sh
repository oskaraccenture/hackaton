#!/usr/bin/env bash
# PreToolUse boundary enforcement (ADR-003).
# Blocks Write/Edit to services/*/routes/ if Spring annotations are detected.
# Input: JSON on stdin — { tool_name, tool_input: { file_path, content|new_string } }

PAYLOAD=$(cat)
TOOL_NAME=$(echo "$PAYLOAD" | jq -r '.tool_name // empty')
FILE=$(echo "$PAYLOAD" | jq -r '.tool_input.file_path // empty')

if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

if [[ -z "$FILE" ]] || [[ ! "$FILE" =~ services/.*/routes/ ]]; then
  exit 0
fi

# Edit carries new_string; Write carries content
if [[ "$TOOL_NAME" == "Edit" ]]; then
  CONTENT=$(echo "$PAYLOAD" | jq -r '.tool_input.new_string // empty')
else
  CONTENT=$(echo "$PAYLOAD" | jq -r '.tool_input.content // empty')
fi

if echo "$CONTENT" | grep -qE '@Document|@Entity|@Column|@RedisHash|spring\.|_class|albumId|release_year|track_count'; then
  echo "BOUNDARY VIOLATION: Spring-era field or annotation detected in service route." >&2
  echo "File: $FILE" >&2
  echo "Translate Spring types via services/album-service/acl/albumAdapter.js first." >&2
  echo "See decisions/003-service-boundary.md" >&2
  exit 1
fi

exit 0
