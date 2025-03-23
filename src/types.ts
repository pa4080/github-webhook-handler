// Type definitions for the webhook application

// Webhook payload structure
export interface WebhookPayload {
  event: string;          // 'push', 'pull_request', etc.
  repository: string;     // repository name in owner/repo format
  commit?: string;        // commit hash
  ref?: string;           // git ref e.g., refs/heads/main
  head?: string;          // branch name
  workflow?: string;      // GitHub workflow name
  requestID: string;      // unique identifier for the request
  
  // Pull request specific fields
  action?: string;        // 'opened', 'closed', 'synchronize', etc. for pull_request events
  pull_request?: {
    number: number;        // Pull request number
    html_url: string;      // URL to the pull request
    title: string;         // Title of the pull request
    body?: string;         // Description of the pull request
    state: string;         // 'open', 'closed'
    merged?: boolean;      // Whether the PR was merged
    head: {
      ref: string;         // Source branch
      sha: string;         // Source commit hash
    };
    base: {
      ref: string;         // Target branch
      sha: string;         // Target commit hash
    };
  };
  
  [key: string]: any;      // Allow for additional properties
}



// Git configuration structure
export interface GitConfig {
  privateKey?: string;
  passphrase?: string;
}
