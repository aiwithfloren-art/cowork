#!/bin/bash
# Smoke-test Sigap prod after a deploy command (git push | vercel).
# Triggered as PostToolUse hook on Bash.

URL="https://cowork-gilt.vercel.app/"

input=$(cat)
case "$input" in
  *'"command":"git push'*|*'"command":"vercel'*) ;;
  *) exit 0 ;;
esac

sleep 45
code=""
for i in 1 2 3 4 5; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL" 2>/dev/null)
  if [ "$code" = "200" ]; then
    printf '{"systemMessage":"Sigap smoke test OK — %s returned 200"}' "$URL"
    exit 0
  fi
  sleep 15
done
printf '{"systemMessage":"Sigap smoke test FAILED — %s returned %s after 5 retries"}' "$URL" "$code"
exit 0
