#!/bin/bash

# Make sure the repos directory exists
mkdir -p repos

# Install dependencies if they don't exist
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  pnpm install
fi

# Build TypeScript code if dist directory doesn't exist or if any TypeScript file has changed
if [ ! -d "dist" ] || [ -n "$(find src -name "*.ts" -newer dist 2>/dev/null)" ]; then
  echo "Building TypeScript code..."
  pnpm run build
fi

# Check if PM2 is available
if command -v pm2 >/dev/null 2>&1; then
  echo "Starting webhook server with PM2..."

  # Check if the app is already running with PM2
  if pm2 list | grep -q "webhook"; then
    echo "Removing existing PM2 process..."
    pm2 stop webhook
    pm2 delete webhook
  fi

  echo "Starting new PM2 process..."
  pm2 start dist/index.js --name webhook

  # Display PM2 status
  pm2 status
else
  # PM2 not found, fall back to Node.js
  echo "PM2 not found. Starting webhook server with Node.js..."
  node dist/index.js
fi
