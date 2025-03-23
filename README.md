# GitHub Webhook Deployer

A TypeScript webhook server that listens for GitHub webhook events, pulls repositories, and executes deployment commands.

## Features

- Built with TypeScript 5.8+ for enhanced type safety and better code organization
- Structured architecture with controllers, utilities, and properly typed interfaces
- Listens for GitHub webhook events (push and pull request) on a configurable port
- Validates webhook signatures using a secret key for security
- Pulls repositories from GitHub (supports both public and private repositories via SSH)
- Executes custom deployment commands after repository updates
- Configurable via environment variables
- Supports running with PM2 process manager for production environments

## Prerequisites

- Node.js (v16 or newer)
- pnpm (recommended) or npm
- Git
- SSH key (for private repositories)
- PM2 (optional, for production deployment)

## Project Structure

```
/
├── dist/               # Compiled TypeScript output
├── scripts/            # Shell scripts for operations
│   ├── start.sh        # Script to start the application
│   └── test-webhook.sh # Script to test the webhook
├── src/                # TypeScript source code
│   ├── controllers/    # Request handlers
│   ├── routes/         # API routes
│   ├── utils/          # Helper utilities
│   ├── config.ts       # Configuration management
│   ├── index.ts        # Main application entry point
│   └── types.ts        # TypeScript interfaces
├── .env                # Environment configuration (create from sample.env)
├── ecosystem.config.js # PM2 configuration
├── package.json        # Project dependencies and scripts
├── tsconfig.json       # TypeScript configuration
└── README.md          # Project documentation
```

## Installation

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd webhook
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Create your environment configuration:
   ```bash
   cp sample.env .env
   ```

4. Edit the `.env` file with your specific configuration:
   - Set your webhook secret key (you can generate a secure random secret with one of these commands):
     ```bash
     # Option 1: Using OpenSSL (recommended)
     openssl rand -hex 32
     
     # Option 2: Using Node.js
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     
     # Option 3: Using Python
     python -c "import secrets; print(secrets.token_hex(32))"
     ```
   - Configure SSH key path for private repositories if needed (`SSH_PRIVATE_KEY_PATH`)
   - Configure `USE_SSH=true` if you want to clone repositories using SSH instead of HTTPS
   - Set up deployment commands for repositories (optional)

## Usage

### Building the TypeScript code

```bash
pnpm run build
```

### Starting the server

```bash
pnpm start
```

The start script automatically:
- Installs dependencies if needed
- Builds TypeScript code if changes are detected
- Uses PM2 if available, otherwise falls back to Node.js

### Alternative start methods

**Direct Node.js execution:**
```bash
pnpm run start:direct
```

**Using PM2 directly:**
```bash
pm2 start ecosystem.config.js
```

**PM2 commands:**
```bash
# Check status
pm2 status

# Restart application
pm2 restart webhook

# View logs
pm2 logs webhook

# Stop application
pm2 stop webhook
```

### Development mode

For development with auto-reload:
```bash
pnpm run dev
```

### Testing the webhook

The project includes a test script to verify your webhook functionality. First, ensure your server is running, then in a separate terminal:

```bash
# Test with push event (default)
pnpm test:webhook

# Or specify the event type
pnpm test:webhook push
pnpm test:webhook pull_request
```

The script:
1. Accepts an event type parameter (`push` or `pull_request`)
2. Creates an appropriate payload based on the event type
3. Generates a HMAC-SHA256 signature using OpenSSL and your webhook secret
4. Sends the payload with the signature to your webhook server

This allows you to verify your webhook server is properly handling both push and pull request events before configuring GitHub.

### Configuring GitHub Webhooks

1. In your GitHub repository, go to Settings > Webhooks > Add webhook
2. Set the Payload URL to your server's URL (e.g., `https://your-server.com/webhook`)
3. Set Content type to `application/json`
4. Set the Secret to the same value as your `WEBHOOK_SECRET` in the `.env` file (use a secure random string generated from commands in the Installation section above)
   - This shared secret is crucial for verifying the authenticity of webhook requests
   - Always use a strong, random secret and never share it publicly
5. Select the events you want to trigger the webhook (both "Push" and "Pull requests" events are supported)
6. Enable SSL verification if your server supports HTTPS
7. Click "Add webhook"

### Configure GitHub Actions

You can trigger this webhook from GitHub Actions using the [Workflow Webhook Action](https://github.com/marketplace/actions/workflow-webhook-action):

```yaml
- name: Trigger deployment webhook
  uses: joelwmale/webhook-action@master
  with:
    url: https://your-server.com/webhook
    headers: '{"X-Hub-Signature-256": "${{ secrets.WEBHOOK_SECRET }}"}'
    body: '{"event": "push", "repository": "${{ github.repository }}", "commit": "${{ github.sha }}", "ref": "${{ github.ref }}", "head": "${{ github.head_ref || github.ref }}", "workflow": "${{ github.workflow }}", "requestID": "${{ github.run_id }}"}'
```

## Repository Configuration

### Repository Detection

The webhook automatically extracts the repository information from the webhook payload:

1. For each incoming webhook, the application reads the `repository` field from the payload (format: `owner/repo`, e.g., `pa4080/exc.js-marker-detector`).
2. The repository URL is automatically constructed as either:
   - HTTPS URL: `https://github.com/{owner}/{repo}`
   - SSH URL: `git@github.com:{owner}/{repo}`
3. The URL type (HTTPS/SSH) is controlled by the `USE_SSH` environment variable.

### Deployment Commands

To set up deployment commands for repositories:

```
# Format: REPO_[repository_name]_COMMAND=deployment_command
REPO_MARKER_DETECTOR_COMMAND="cd /path/to/deployment && git pull && npm install && npm run build"
```

The application will try to match the repository name from the payload to find the correct deployment command using several formats:

1. Exact name: `REPO_reponame_COMMAND`
2. Uppercase: `REPO_REPONAME_COMMAND`
3. With underscores: `REPO_repo_name_COMMAND` (for repos with hyphens)

If no matching command is found, the repository will still be cloned/pulled but no deployment will run.

## Security Considerations

- Always use HTTPS in production environments
- Keep your webhook secret key secure and use a strong value
- Use SSH keys with proper access restrictions for repository operations
- Store sensitive configuration in the `.env` file (never commit this file)
- Consider running the server behind a reverse proxy
- PM2 helps manage the application lifecycle for increased reliability

## Troubleshooting

- Check the logs using `pm2 logs webhook` if using PM2
- Verify signature calculation if you receive 401 Unauthorized errors
- Ensure any deployment commands are correctly configured in the `.env` file
- Validate SSH access by manually trying to clone the repository using the same SSH key

## License

MIT
