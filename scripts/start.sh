#!/bin/bash

# Define the application directory
# Assumes this script is located in your_project_root/scripts/
# Adjust the path accordingly if the script is elsewhere
APP_DIR="$(dirname "$0")/.." # Go up one level from the 'scripts' directory

# Change to the application directory
cd "$APP_DIR" || {
  echo "Error: Failed to change directory to $APP_DIR"
  exit 1
}

# Make sure the repos directory exists
mkdir -p repos

# Ensure dependencies are installed using pnpm
echo "Ensuring dependencies are installed with pnpm..."
# Using --prod only installs production dependencies, keeping node_modules smaller
# --frozen-lockfile ensures you install exactly what's in pnpm-lock.yaml
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  pnpm install --frozen-lockfile || {
    echo "Error: pnpm install failed"
    exit 1
  }
fi

# Build TypeScript code if dist directory doesn't exist or if any TypeScript file has changed
if [ ! -d "dist" ] || [ -n "$(find src -name "*.ts" -newer dist 2>/dev/null)" ]; then
  echo "Building TypeScript code..."
  pnpm run build || {
    echo "Error: Project build failed"
    exit 1
  }
fi

# Remove dist/public if exists and copy the contents of src/public to dist/public
if [ -d "dist/public" ]; then
  echo "Removing dist/public..."
  rm -rf dist/public
fi
echo "Copying src/public to dist/public..."
cp -R src/public dist/public

# Check if PM2 is available
if command -v pm2 >/dev/null 2>&1; then
  echo "Starting webhook server with PM2..."

  # Define the PM2 application name from your ecosystem.config.js
  PM2_APP_NAME="webhook" # Make sure this matches the 'name' in ecosystem.config.js

  # Stop and delete the existing PM2 process if it's running
  echo "Stopping and deleting existing PM2 process ($PM2_APP_NAME) if running..."
  # Check if the process exists before trying to stop/delete
  if pm2 list | grep -q " ${PM2_APP_NAME} "; then
    echo "$PM2_APP_NAME found in PM2 list. Stopping and deleting..."
    pm2 stop "$PM2_APP_NAME"
    pm2 delete "$PM2_APP_NAME"
    echo "$PM2_APP_NAME stopped and deleted."
  else
    echo "$PM2_APP_NAME not found in PM2 list. No need to stop/delete."
  fi

  # Create logs directory if it doesn't exist
  mkdir -p ./logs || {
    echo "Error: Failed to create logs directory"
    exit 1
  }

  # Start the application with PM2 using the ecosystem file, or the default start command
  if [ -f "ecosystem.config.js" ]; then
    echo "Starting application with PM2 using ecosystem.config.js..."
    # The --env flag can be used if you defined env_production block in ecosystem.config.js
    # but using the 'env' block directly is also common. Let's rely on the 'env' block.
    pm2 start ecosystem.config.cjs --env production || {
      echo "Error: PM2 failed to start the application"
      exit 1
    }
  else
    echo "Starting new PM2 process..."
    export NODE_ENV=production
    pm2 start dist/index.js --name $PM2_APP_NAME --env production || {
      echo "Error: PM2 failed to start the application"
      exit 1
    }
  fi

  # Display PM2 status
  echo "PM2 status:"
  pm2 status

  # Save the PM2 configuration
  echo "PM2 configuration save."
  pm2 save
else
  # PM2 not found, fall back to Node.js
  echo "PM2 not found. Starting webhook server with Node.js..."
  node dist/index.js
fi
