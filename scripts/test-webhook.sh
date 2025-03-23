#!/bin/bash

. $PWD/.env

# Configuration with fallbacks
: ${WEBHOOK_URL:="http://localhost:3071/webhook"}
: ${WEBHOOK_SECRET:="your_webhook_secret_key_here"}

echo "Using webhook URL: $WEBHOOK_URL"
echo "Using webhook secret: $(echo "$WEBHOOK_SECRET" | cut -c1-3)****"

# Accept event type as a parameter or default to push
EVENT_TYPE="${1:-push}"
# Validate event type
if [ "$EVENT_TYPE" != "push" ] && [ "$EVENT_TYPE" != "pull_request" ]; then
    echo "Error: Invalid event type '$EVENT_TYPE'. Valid options are: push, pull_request"
    exit 1
fi

echo "Testing webhook with event type: ${EVENT_TYPE}"
# Create the appropriate payload based on event type
if [ "$EVENT_TYPE" = "pull_request" ]; then
    # Pull request payload that matches GitHub's format
    PAYLOAD='{"action":"opened","repository":{"full_name":"pa4080/exc.js-marker-detector"},"pull_request":{"number":123,"html_url":"https://github.com/pa4080/exc.js-marker-detector/pull/123","title":"Feature: Add new functionality","state":"open","merged":false,"head":{"ref":"feature-branch","sha":"a636b6f0861bbee98039bf3df66ee13d8fbc9c74"},"base":{"ref":"main","sha":"b74e39826c8b8bf946f9e1981e3f743e9387c0a1"}}}'
else
    # Push payload that matches GitHub's format
    PAYLOAD='{"ref":"refs/heads/master","repository":{"full_name":"pa4080/exc.js-marker-detector"},"head_commit":{"id":"a636b6f0861bbee98039bf3df66ee13d8fbc9c74"}}'
fi

# Generate the signature using OpenSSL
echo "Generating signature using OpenSSL..."
SIGNATURE="sha256=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | cut -d ' ' -f 2)"





# Print the payload and signature for debugging
echo "Sending webhook to $WEBHOOK_URL with payload:"
echo "$PAYLOAD"
echo
echo "Using signature: $SIGNATURE"
echo

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  -H "X-GitHub-Event: $EVENT_TYPE" \
  -H "X-GitHub-Delivery: $(uuidgen || date +%s)" \
  -d "$PAYLOAD" \
  -v \
  -w "\n\nStatus code: %{http_code}\n"
