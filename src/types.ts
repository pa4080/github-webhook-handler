// Type definitions for the webhook application

// Webhook payload structure following GitHub's webhook format
export interface WebhookPayload {
  // Common fields that we use
  event?: string;          // Set from X-GitHub-Event header

  // Repository information (GitHub format)
  repository?: {
    full_name: string;     // Repository name in 'owner/repo' format
    name: string;         // Repository name without owner
    owner: {
      login: string;       // Repository owner username
    };
    html_url?: string;     // Repository URL
    [key: string]: any;    // Other repository properties
  };

  // Git reference information
  ref?: string;            // Git ref e.g., refs/heads/main
  before?: string;         // SHA of the previous commit (push event)
  after?: string;          // SHA of the current commit (push event)

  // Action for events like pull_request, issues, etc.
  action?: string;         // 'opened', 'closed', 'synchronize', etc.

  // Push event specific fields
  head_commit?: {
    id: string;            // Commit SHA
    message: string;      // Commit message
    timestamp?: string;    // Commit timestamp
    author: {
      username: string;
      name: string;
    };
    modified: string[];
    [key: string]: any;    // Other commit properties
  };

  // Pull request specific fields -- removed in the current version
  pull_request?: {
    number: number;        // Pull request number
    html_url: string;      // URL to the pull request
    title: string;         // Title of the pull request
    body?: string;         // Description of the pull request
    state: string;         // 'open', 'closed'
    merged: boolean;      // Whether the PR was merged
    user: {
      login: string;
    };
    head: {
      ref: string;         // Source branch
      sha: string;         // Source commit hash
      [key: string]: any;  // Other head properties
    };
    base: {
      ref: string;         // Target branch
      sha: string;         // Target commit hash
      [key: string]: any;  // Other base properties
    };
    [key: string]: any;    // Other pull request properties
  };

  [key: string]: any;      // Allow for additional properties
}

// Repository configuration interface
export interface RepoConfig {
  branch: string;
  commands?: string[];
  ssh_key_path?: string;
  ssh_key_passphrase?: string;
  env_vars?: Record<string, string>;
  health_check_url?: string;
  timeout?: number;
  max_retries?: number;
  retry_delay?: number;
}

export interface ReposConfig {
  [repository: string]: RepoConfig;
}
