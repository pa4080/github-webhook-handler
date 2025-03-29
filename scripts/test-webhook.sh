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
if [ "$EVENT_TYPE" != "push" ]; then
    echo "Error: Invalid event type '$EVENT_TYPE'. Valid options are: push"
    exit 1
fi

echo "Testing webhook with event type: ${EVENT_TYPE}"

PAYLOAD='{"ref":"refs/heads/master","repository":{"full_name":"pa4080/exc.js-marker-detector"},"head_commit":{"id":"a636b6f0861bbee98039bf3df66ee13d8fbc9c74"}}'

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
