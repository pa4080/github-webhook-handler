#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Source the .env file from the root directory
if [ -f "$ROOT_DIR/.env" ]; then
  echo "Loading environment from $ROOT_DIR/.env"
  source "$ROOT_DIR/.env"
else
  echo "Warning: .env file not found in $ROOT_DIR"
fi

# Configuration with fallbacks
: ${WEBHOOK_URL:="http://localhost:3000/webhook"}
: ${WEBHOOK_SECRET:="your_webhook_secret_key_here"}

echo "Using webhook URL: $WEBHOOK_URL"
echo "Using webhook secret: ${WEBHOOK_SECRET:0:3}****"

# Accept event type as a parameter or default to push
EVENT_TYPE="${1:-push}"
valid_events=("push" "pull_request")

# Validate event type
if [[ ! " ${valid_events[*]} " =~ " ${EVENT_TYPE} " ]]; then
    echo "Error: Invalid event type '${EVENT_TYPE}'. Valid options are: push, pull_request"
    exit 1
fi

echo "Testing webhook with event type: ${EVENT_TYPE}"
# Create the appropriate payload based on event type
if [[ "$EVENT_TYPE" == "pull_request" ]]; then
    # Pull request payload
    PAYLOAD='{"event":"pull_request","repository":"pa4080/exc.js-marker-detector","action":"opened","requestID":"74b1912d19cfe780f1fada4b525777fd","pull_request":{"number":123,"html_url":"https://github.com/pa4080/exc.js-marker-detector/pull/123","title":"Feature: Add new functionality","state":"open","merged":false,"head":{"ref":"feature-branch","sha":"a636b6f0861bbee98039bf3df66ee13d8fbc9c74"},"base":{"ref":"main","sha":"b74e39826c8b8bf946f9e1981e3f743e9387c0a1"}}}'
else
    # Push payload
    PAYLOAD='{"event":"push","repository":"pa4080/exc.js-marker-detector","commit":"a636b6f0861bbee98039bf3df66ee13d8fbc9c74","ref":"refs/heads/master","head":"","workflow":"Build and deploy","requestID":"74b1912d19cfe780f1fada4b525777fd"}'
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
  -d "$PAYLOAD" \
  -v \
  -w "\n\nStatus code: %{http_code}\n"
