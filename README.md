# GitHub Webhook Handler

> **Disclaimer**: This project was created using Vibe Coding's [Windsurf AI IDE](https://codeium.com/windsurf). The code and structure were generated with the help of AI, but it has been reviewed and modified by human developers to ensure quality and functionality.

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
```

The script:

1. Accepts an event type parameter `push`
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

### Health Check Endpoint

To verify the health of the webhook server, you can use the `https://your-server.com/health` endpoint. This endpoint responds with the status of the server and its current version.

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

All repository configurations are stored in a single file located at `repos/config.json`, Example configuration:

```bash
cat repos/config.json
```

```json
{
    "repository.name.1": {
        "branch": "main",
        "commands": [
            "pnpm install",
            "pnpm docker:deploy"
        ],
    },
    "repository.name.2": {
        "branch": "main",
        "repo_supported_events": ["push"],
        "env_vars": {
            "NODE_ENV": "production",
            "ACCESS_TOKEN": "your-access-token"
        },
    }
}
```

For more details see [app-repos.config.json](app-repos.config.json) for an example configuration template. Configuration Options:

- `branch`: The branch to deploy from (default: main)
- `command`: Single deployment command to run (deprecated, use `commands` array instead)
- `commands`: Array of deployment commands to run in sequence
- `package_manager`: Package manager to use (npm, pnpm, yarn)
- `ssh_key_path`: Path to SSH private key for private repos
- `ssh_key_passphrase`: Passphrase for SSH key (if needed)
- `env_vars`: Environment variables to set
- `pre_deploy_commands`: Commands to run before deployment
- `post_deploy_commands`: Commands to run after deployment
- `notifications`: Notification settings (Slack, email)
- `health_check_url`: URL to check after deployment
- `timeout`: Deployment timeout in seconds
- `max_retries`: Maximum retry attempts
- `retry_delay`: Delay between retries in seconds

## Environment Variables

The application uses the following environment variables:

- `PORT`: Port to listen on (default: 3000)
- `WEBHOOK_SECRET`: Secret key for webhook signature verification
- `USE_SSH`: Set to 'true' to use SSH for cloning (default: false)
- `SSH_PRIVATE_KEY_PATH`: Path to SSH private key for private repos
- `SSH_KEY_PASSPHRASE`: Passphrase for SSH key (if needed)

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
