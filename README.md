# GitHub Webhook Handler

> **Disclaimer**: This project was created using Vibe Coding's [Windsurf AI IDE](https://codeium.com/windsurf). The code and structure were generated with the help of AI, but it has been reviewed and modified by me to ensure quality and functionality. Actually the generated code was pretty ugly, so I cleaned it up a bit.

A TypeScript webhook server that listens for GitHub webhook events, pulls repositories, and executes deployment commands.

## Features

- Built with TypeScript 5.8+ for enhanced type safety and better code organization
- Structured architecture with controllers, utilities, and properly typed interfaces
- Listens for GitHub webhook events (`push`) on a configurable port; automatically acknowledges `ping` events sent by GitHub when a webhook is first created
- Validates webhook signatures using a secret key for security
- Pulls repositories from GitHub (supports both public and private repositories via SSH)
- Executes custom deployment commands after repository updates
- Configurable via environment variables
- Supports running with PM2 process manager for production environments
- **GitHub Deployment reporting** — creates GitHub Deployment records and updates their status so self-hosted VPS deployments appear on the GitHub Deployments page

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
   - Set your `WEBHOOK_SECRET` key (you can generate a secure random secret with one of these commands):

     ```bash
     # Option 1: Using OpenSSL (recommended)
     openssl rand -hex 32

     # Option 2: Using Node.js
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

     # Option 3: Using Python
     python -c "import secrets; print(secrets.token_hex(32))"

     ```

   - Use the same approach  and set `MONITORING_SECRET` key. Or leave it empty to disable this functionality. For more details see the section **Monitoring PM2 Endpoint**.

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
- **Builds TypeScript code if changes are detected**
- Copy `src/public` to `dist/public`
- Uses PM2 if available, otherwise falls back to Node.js

### Alternative start methods

**Direct Node.js execution:**

```bash
pnpm run start:direct
```

**Using PM2 directly:**

```bash
pm2 start ecosystem.config.cjs --env production
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
5. Select the events you want to trigger the webhook — choose **"Push"** events (the handler also automatically acknowledges **"Ping"** events that GitHub sends when a webhook is first created; pull request events are not processed)
6. Enable SSL verification if your server supports HTTPS
7. Click "Add webhook"

### Health Check Endpoint

To verify the health of the webhook server, you can use the `https://your-server.com/health` endpoint. This endpoint responds with the status of the server and its current version.

### Monitoring PM2 Endpoint

If you have provided `MONITORING_SECRET` in the `.env` file, ou can use the `https://your-server.com/monitoring?secret=<your_monitoring_secret_key_here>` endpoint. This endpoint will print in the browser window the output of `pm2 logs webhook` command. So you will be able to monitor the deploument of your applications without login into the server.

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

All repository configurations are stored in a single file located at `repos/config.json`. Each top-level key **must** be the repository's full name in `owner/repo` format — exactly as GitHub reports it in `repository.full_name`. The handler looks up the incoming push event's `repository.full_name` to find the matching entry.

Example configuration with four common patterns:

```bash
cat repos/config.json
```

```json
{
    "acme-org/website": {
        "branch": "main",
        "commands": [
            "pnpm install",
            "pnpm build",
            "pnpm docker:build"
        ]
    },
    "acme-org/api-server": {
        "branch": "master",
        "commands": [
            "/usr/local/bin/docker-prune.sh",
            "pnpm docker:build",
            "pnpm install",
            "pnpm backup:db",
            "/usr/local/bin/docker-prune.sh"
        ],
        "env_vars": {
            "NODE_ENV": "production",
            "DOPPLER_TOKEN": "dp.st.prod.YOUR_TOKEN_HERE"
        }
    },
    "acme-org/frontend": {
        "branch": "master",
        "commands": [
            "pnpm env:pull",
            "pnpm i",
            "pnpm build",
            "pnpm pm2",
            "pnpm send-email",
            "curl https://n8n.internal/webhook/deploy-done"
        ],
        "github_deployment": {
            "enabled": true,
            "environment": "production",
            "environment_url": "https://www.acme-org.com",
            "description": "Deploying acme-org/frontend to self-hosted VPS",
            "auto_merge": false,
            "required_contexts": [],
            "transient_environment": false,
            "production_environment": true,
            "fail_deployment_on_status_error": false
        },
        "env_vars": {
            "NODE_ENV": "production",
            "USE_SSH": "true",
            "NODE_OPTIONS": "--max-old-space-size=4096",
            "GITHUB_TOKEN": "github_pat_YOUR_TOKEN_HERE"
        }
    },
    "partner-org/shared-sdk": {
        "branch": "main",
        "commands": [
            "cp -f .env.local .env",
            "pnpm i",
            "pnpm pm2:deploy"
        ],
        "env_vars": {
            "NODE_ENV": "production",
            "USE_SSH": "true"
        }
    }
}
```

> **Security note:** Never commit secrets (API tokens, passwords, private keys) directly in `repos/config.json`. Use environment variable references via `env_vars` keys and keep the actual values in `.env` or a secret manager such as Doppler, Vault, or similar.

For a ready-to-copy boilerplate covering the most common deployment patterns, see [`app-repos.config.json`](app-repos.config.json). Configuration Options:

- `branch`: The branch to deploy from (default: `master`)
- `commands`: Array of deployment commands to run in sequence; any executable or shell command is accepted (e.g. shell scripts, `curl`, package-manager scripts)
- `ssh_key_path`: Path to SSH private key file for this repo (overrides global `SSH_PRIVATE_KEY_PATH`)
- `ssh_key_passphrase`: Passphrase for the per-repo SSH key (if needed)
- `env_vars`: Environment variables injected into every deployment command for this repository. Use this to pass secrets, set `NODE_OPTIONS`, override `USE_SSH`, or supply per-repo `GITHUB_TOKEN` values.
- `health_check_url`: URL to `GET` after a successful deployment to verify the service is up
- `timeout`: Per-command timeout in seconds — the process is sent SIGTERM if exceeded
- `max_retries`: Maximum retry attempts on command failure
- `retry_delay`: Delay between retries in seconds
- `github_deployment`: GitHub Deployment reporting block — see [GitHub Deployment Reporting](#github-deployment-reporting)

> **Legacy / ignored fields:** Older config files may contain `package_manager` and `repo_supported_events`. These fields are not read by the current runtime and have no effect — they can be safely removed or left in place.

## Environment Variables

Copy [`sample.env`](sample.env) to `.env` and fill in your values (`.env` is git-ignored and must never be committed):

```bash
cp sample.env .env
```

```bash
cat sample.env
```

```ini
# Server Configuration
PORT=3000
WEBHOOK_SECRET=your_webhook_secret_key_here
MONITORING_SECRET=your_monitoring_secret_key_here
USE_SSH=false

# Public base URL of this webhook server (used to auto-generate deployment log links).
# Example: https://webhook.your-domain.com
# When set together with MONITORING_SECRET, the GitHub Deployment log_url is automatically
# built as: ${SERVER_BASE_URL}/monitoring?token=<hmac>&repo=<owner/repo>&ts=<timestamp>
# The HMAC token is unique per deployment and scoped to the specific repository.
# You can still override log_url per-repo in repos/config.json github_deployment.log_url.
SERVER_BASE_URL="https://webhook.your-domain.com"

# Test Webhook Configuration - used by `scripts/test-webhook.sh`
WEBHOOK_URL="http://localhost:3000/webhook"

# SSH Configuration for Private Repositories
SSH_PRIVATE_KEY_PATH=
SSH_KEY_PASSPHRASE=

# GitHub Deployment Reporting (optional)
# A GitHub token with "Deployments: Read and write" permission is required when
# github_deployment.enabled is set to true for any repository in repos/config.json.
# Fine-grained PAT: target repository access + Deployments: Read and write
# GitHub App:       repository permission Deployments: Read and write
GITHUB_TOKEN=

# Note: Repository-specific configurations should be placed in the repos/config.json file
# See app-repos.config.json for an example configuration template
```

Variable reference:

- `PORT`: Port to listen on (default: 3000)
- `WEBHOOK_SECRET`: Secret key for webhook signature verification
- `MONITORING_SECRET`: Secret key for the `/monitoring` endpoint; leave empty to disable
- `USE_SSH`: Set to `true` to use SSH for all `git clone/pull` operations (default: `false`; can be overridden per repo via `env_vars`)
- `SSH_PRIVATE_KEY_PATH`: Global path to SSH private key for private repos (can be overridden per repo via `ssh_key_path`)
- `SSH_KEY_PASSPHRASE`: Passphrase for the global SSH key (if needed)
- `SERVER_BASE_URL`: Public base URL of this webhook server (e.g. `https://webhook.your-domain.com`). Used to auto-generate deployment log links — see [GitHub Deployment Reporting](#github-deployment-reporting)
- `GITHUB_TOKEN`: GitHub token required when `github_deployment.enabled` is `true` for any repository (see [GitHub Deployment Reporting](#github-deployment-reporting))

## GitHub Deployment Reporting

The webhook handler can optionally create GitHub Deployment records and update their status during self-hosted deployments. This allows deployments from a VPS to appear in the GitHub repository deployments page:

```bash
https://github.com/<owner>/<repo>/deployments
```

### How it works

When a `push` event is received and `github_deployment.enabled` is `true`:

1. A GitHub Deployment is created for the exact commit SHA (`payload.after`).
2. A deployment status of `in_progress` is immediately posted.
3. The configured deployment commands are executed.
4. On success a `success` status is posted; on failure a `failure` status is posted.

If GitHub API calls fail and `fail_deployment_on_status_error` is `false` (the default), the error is only logged — the actual deployment continues.

### Required GitHub token

Set the `GITHUB_TOKEN` environment variable to a token with **Deployments: Read and write** access for the target repository:

| Token type       | Required permission                                        |
| ---------------- | ---------------------------------------------------------- |
| Fine-grained PAT | Target repository access + **Deployments: Read and write** |
| GitHub App       | Repository permission **Deployments: Read and write**      |

If `github_deployment.enabled` is `false` for every repository, no token is required.

### Automatic deployment log URL

When GitHub Deployment reporting is enabled the handler can automatically populate the **log URL** — the link shown on GitHub's Deployments page that takes you straight to the deployment logs. No per-repository configuration is needed: just set two environment variables in `.env`:

```ts
SERVER_BASE_URL=https://webhook.your-domain.com
MONITORING_SECRET=your_monitoring_secret_key_here
```

The handler constructs a **unique, per-deployment signed log URL** for each deployment:

```ts
${SERVER_BASE_URL}/monitoring?token=<hmac>&repo=<owner%2Frepo>&ts=<timestamp>
```

- **`token`** — a 32-character HMAC-SHA256 signature of `"<repo>:<ts>"` keyed with `MONITORING_SECRET`, making each link unique and verifiable without server-side state.
- **`repo`** — the full repository name (`owner/repo`), used by the monitoring endpoint to filter the PM2 log stream to lines related to that specific repository.
- **`ts`** — the Unix timestamp (milliseconds) at deployment time, ensuring each deployment gets its own distinct URL.

This opens the server's built-in PM2 log stream (`/monitoring`) filtered to that repository's log output, directly from GitHub's UI. If you prefer a different URL, set `log_url` explicitly in the repository's `github_deployment` block and it will take precedence.

> **Security note:** The auto-generated `log_url` is visible to everyone with repository access via GitHub's Deployments API and UI. Each deployment link is unique and repo-scoped, but `MONITORING_SECRET` remains the root of trust. If your repository is public or has a wide collaborator base, consider setting `log_url` to an alternative log URL.
> **Backward compatibility:** The `/monitoring?secret=<MONITORING_SECRET>` endpoint continues to work and streams all logs without repo filtering.

### Configuration reference

Add a `github_deployment` block to a repository entry in `repos/config.json`:

```json
{
  "pa4080/snapix": {
    "branch": "master",
    "commands": ["./deploy.sh"],
    "github_deployment": {
      "enabled": true,
      "environment": "production",
      "environment_url": "https://your-snapix-domain.com",
      "description": "Deploying SnapiX to self-hosted VPS",
      "auto_merge": false,
      "required_contexts": [],
      "transient_environment": false,
      "production_environment": true,
      "fail_deployment_on_status_error": false
    },
    "env_vars": {
        "GITHUB_TOKEN": "your-github-token-here if it is repo-specific, otherwise set it in the .env file",
        "NODE_ENV": "production",
        "USE_SSH": "true"
    }
  }
}
```

> **Note:** `log_url` is omitted above because it is auto-generated from `SERVER_BASE_URL` and `MONITORING_SECRET`. You can still set it explicitly to override the auto-generated value.

| Field                             | Type       | Default                                                                                       | Description                                                      |
| --------------------------------- | ---------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `enabled`                         | `boolean`  | `false`                                                                                       | Enable GitHub Deployment reporting for this repository           |
| `environment`                     | `string`   | `"production"`                                                                                | Deployment environment name shown on GitHub                      |
| `environment_url`                 | `string`   | —                                                                                             | Public URL of the deployed application                           |
| `log_url`                         | `string`   | Auto-generated from `SERVER_BASE_URL`+`MONITORING_SECRET`; omit to use the auto-generated URL | URL to deployment logs shown on GitHub's Deployments page        |
| `description`                     | `string`   | `"Deploying to self-hosted VPS"`                                                              | Human-readable deployment description                            |
| `auto_merge`                      | `boolean`  | `false`                                                                                       | Whether GitHub should auto-merge the default branch into the ref |
| `required_contexts`               | `string[]` | `[]`                                                                                          | Status check contexts required before creating the deployment    |
| `transient_environment`           | `boolean`  | `false`                                                                                       | Whether the environment is ephemeral                             |
| `production_environment`          | `boolean`  | `true` when `environment === "production"`                                                    | Whether this is a production environment                         |
| `fail_deployment_on_status_error` | `boolean`  | `false`                                                                                       | When `true`, GitHub API errors fail the overall deployment       |

### Deployment status lifecycle

```bash
push received → GitHub Deployment created → in_progress
                                                  ↓
                                         run deploy commands
                                          ↙           ↘
                                       success       failure
```

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
- **Deployment command killed / JavaScript heap out of memory**: A build step (e.g. Next.js) ran out of memory. Add `"NODE_OPTIONS": "--max-old-space-size=4096"` (or a higher value) inside the `env_vars` block for the repository entry in `repos/config.json` to increase the Node.js heap limit for all deployment commands.

### GitHub Deployment Reporting Troubleshooting

- **Deployments do not appear on GitHub**: Check that `github_deployment.enabled` is `true`, `GITHUB_TOKEN` is set, the token has **Deployments: Read and write** permission for the target repository, and that the `owner/repo` key in `repos/config.json` matches the repository's `full_name` exactly.
- **Deployment status stuck at "in progress"**: The handler process likely crashed before it could post the final status. Check the server logs for errors.
- **Deployment fails even though the deploy command succeeded**: Check whether `fail_deployment_on_status_error` is `true`. If so, a GitHub API error will cause the overall deployment to be reported as failed.
- **Log URL not appearing on GitHub**: Set `SERVER_BASE_URL` and `MONITORING_SECRET` in `.env`, or set `log_url` explicitly in the `github_deployment` block.

## License

MIT
