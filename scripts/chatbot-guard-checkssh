#!/usr/bin/env bash
set -euo pipefail

failures=0

pass() {
  echo "[PASS] $1"
}

fail() {
  echo "[FAIL] $1"
  failures=$((failures + 1))
}

require_pattern() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if rg -q "$pattern" "$file"; then
    pass "$description"
  else
    fail "$description"
  fi
}

# 1) Telemetry event channel existence.
require_pattern "chatbot/chatbot.js" 'TELEMETRY_CHANNEL\s*=\s*"chatbot-telemetry"' "Telemetry channel constant exists"
require_pattern "chatbot/chatbot.js" 'new CustomEvent\(TELEMETRY_CHANNEL' "Telemetry event dispatch exists"

# 2) Rate-limit constants and enforcement flow.
require_pattern "chatbot/chatbot.js" 'RATE_LIMIT_WINDOW_MS\s*=\s*' "Rate-limit window constant exists"
require_pattern "chatbot/chatbot.js" 'RATE_LIMIT_MAX_MESSAGES\s*=\s*' "Rate-limit max constant exists"
require_pattern "chatbot/chatbot.js" 'function isRateLimited\(' "Rate-limit helper exists"
require_pattern "chatbot/chatbot.js" 'if \(isRateLimited\(\)\)' "Rate-limit enforcement in submit flow exists"

# 3) Output sanitization hook presence.
require_pattern "chatbot/chatbot.js" 'function sanitizeBotOutput\(' "Sanitization hook exists"
require_pattern "chatbot/chatbot.js" 'bubble\.textContent \+= sanitizeBotOutput\(delta\)' "Sanitization hook is used on streamed output"

# 4) SSE streaming path still present.
require_pattern "chatbot/chatbot.js" 'Accept:\s*"text/event-stream"' "SSE Accept header exists"
require_pattern "chatbot/chatbot.js" 'resp\.body\.getReader\(' "SSE stream reader exists"

# 5) Escape/outside-click close interactions.
require_pattern "chatbot/chatbot.js" 'e\.key === "Escape"' "Escape-key close handler exists"
require_pattern "chatbot/chatbot.js" 'document\.addEventListener\("click", \(event\) => \{' "Outside-click listener exists"
require_pattern "chatbot/chatbot.js" 'closeChatbot\(\);' "Close interaction calls closeChatbot"

# 6) FAB mount not hard-hidden.
if rg -q 'id="chatbot-launcher"' chatbot/chatbot.html; then
  if rg -q '#chatbot-launcher[^\{]*\{[^\}]*display:\s*none' chatbot/chatbot.css; then
    fail "FAB is mounted and hard-hidden via display:none"
  else
    pass "FAB mount exists and is not hard-hidden"
  fi
else
  pass "FAB mount removed (no hidden FAB left behind)"
fi

if [[ "$failures" -gt 0 ]]; then
  echo "Chatbot guard checks failed: $failures"
  exit 1
fi

echo "All chatbot guard checks passed."
