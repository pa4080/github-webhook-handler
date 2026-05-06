import { Octokit } from '@octokit/rest';
import { GitHubDeploymentConfig } from '../types';

export type DeploymentState = 'in_progress' | 'success' | 'failure' | 'error';

interface ResolvedDeploymentConfig {
  environment: string;
  environment_url?: string;
  log_url?: string;
  description: string;
  auto_merge: boolean;
  required_contexts: string[];
  transient_environment: boolean;
  production_environment: boolean;
  fail_deployment_on_status_error: boolean;
}

/**
 * Resolve a GitHubDeploymentConfig, filling in defaults for optional fields.
 */
export function resolveDeploymentConfig(cfg: GitHubDeploymentConfig): ResolvedDeploymentConfig {
  const environment = cfg.environment ?? 'production';
  return {
    environment,
    environment_url: cfg.environment_url,
    log_url: cfg.log_url,
    description: cfg.description ?? 'Deploying to self-hosted VPS',
    auto_merge: cfg.auto_merge ?? false,
    required_contexts: cfg.required_contexts ?? [],
    transient_environment: cfg.transient_environment ?? false,
    production_environment: cfg.production_environment ?? (environment === 'production'),
    fail_deployment_on_status_error: cfg.fail_deployment_on_status_error ?? false,
  };
}

/**
 * Build an Octokit instance using the GITHUB_TOKEN environment variable.
 * Returns null (with a logged warning) if the token is absent.
 */
function buildOctokit(): Octokit | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn(
      '[github-deployment] GITHUB_TOKEN is not set. GitHub Deployment reporting will be skipped.'
    );
    return null;
  }
  return new Octokit({ auth: token });
}

/**
 * Create a GitHub Deployment for the given commit SHA/ref.
 * Returns the deployment ID, or null if creation failed and
 * fail_deployment_on_status_error is false.
 */
export async function createGitHubDeployment(
  owner: string,
  repo: string,
  ref: string,
  cfg: ResolvedDeploymentConfig
): Promise<number | null> {
  const octokit = buildOctokit();
  if (!octokit) return null;

  try {
    const { data } = await octokit.repos.createDeployment({
      owner,
      repo,
      ref,
      environment: cfg.environment,
      description: cfg.description,
      auto_merge: cfg.auto_merge,
      required_contexts: cfg.required_contexts,
      transient_environment: cfg.transient_environment,
      production_environment: cfg.production_environment,
    });

    // GitHub may respond with 202 (merged branch) instead of an id
    if (!('id' in data)) {
      console.warn('[github-deployment] Deployment creation returned no id (merged branch response).');
      return null;
    }

    console.log(`[github-deployment] Created GitHub deployment id=${data.id} for ${owner}/${repo}@${ref}`);
    return data.id;
  } catch (error) {
    const msg = `[github-deployment] Failed to create GitHub deployment: ${error instanceof Error ? error.message : String(error)}`;
    if (cfg.fail_deployment_on_status_error) {
      throw new Error(msg);
    }
    console.error(msg);
    return null;
  }
}

/**
 * Create a GitHub Deployment Status for the given deployment.
 * If the update fails and fail_deployment_on_status_error is false, the error
 * is only logged and does not propagate.
 */
export async function createGitHubDeploymentStatus(
  owner: string,
  repo: string,
  deploymentId: number,
  state: DeploymentState,
  cfg: ResolvedDeploymentConfig
): Promise<void> {
  const octokit = buildOctokit();
  if (!octokit) return;

  const stateDescriptions: Record<DeploymentState, string> = {
    in_progress: 'Deployment in progress',
    success: 'Deployment completed successfully',
    failure: 'Deployment failed',
    error: 'Deployment encountered an unexpected error',
  };

  try {
    await octokit.repos.createDeploymentStatus({
      owner,
      repo,
      deployment_id: deploymentId,
      state,
      environment_url: cfg.environment_url,
      log_url: cfg.log_url,
      description: stateDescriptions[state],
    });
    console.log(`[github-deployment] Deployment status set to "${state}" for id=${deploymentId}`);
  } catch (error) {
    const msg = `[github-deployment] Failed to set deployment status to "${state}": ${error instanceof Error ? error.message : String(error)}`;
    if (cfg.fail_deployment_on_status_error) {
      throw new Error(msg);
    }
    console.error(msg);
  }
}
