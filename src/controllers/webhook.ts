import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { verifySignature } from '../utils/webhook';
import { getRepoConfig, DEFAULT_BRANCH } from '../config';
import { cloneOrPullRepository } from '../utils/git';
import { executeDeployment } from '../utils/deployment';
import {
  resolveDeploymentConfig,
  createGitHubDeployment,
  createGitHubDeploymentStatus,
} from '../utils/github-deployment';
import { WebhookPayload, RepoConfig } from '../types';

/**
 * Handle webhook requests from GitHub
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const githubEvent = req.headers['x-github-event'] as string | undefined;
  const deliveryId = req.headers['x-github-delivery'] as string | undefined;
  const rawPayload = req.rawBody || '';

  console.log(`Received webhook with event: ${githubEvent}${deliveryId ? `, delivery ID: ${deliveryId}` : ''}`);

  // Verify signature using the raw payload body
  if (!verifySignature(rawPayload, signature)) {
    console.error('Invalid webhook signature');
    res.status(401).send('Invalid signature');
    return;
  }

  // Log the payload after validating the signature
  console.log('Webhook payload:', JSON.stringify(JSON.parse(rawPayload), null, 2));

  // Parse the payload
  const payload = JSON.parse(rawPayload) as WebhookPayload;

  // If githubEvent header is present, use it as the event type
  if (githubEvent) {
    payload.event = githubEvent;
  }

  // Validate payload and check for supported events
  if (!payload.event) {
    console.error('Invalid webhook payload format: missing event');
    res.status(400).send('Invalid payload format: missing event');
    return;
  }

  // Handle ping event (sent when webhook is created)
  if (payload.event === 'ping') {
    console.log('Received ping event from GitHub');
    res.status(200).send('Pong!');
    return;
  }

  // Extract repository information based on event type
  let repository = '';
  let branch = '';
  let commitSha = 'unknown';
  let skipDeployment = true;

  if (payload.event === 'push') {
    skipDeployment = false;

    // Extract repository from GitHub's push payload format
    if (payload.repository?.full_name) {
      repository = payload.repository.full_name;
    } else {
      console.error('Invalid push payload: missing repository.full_name');
      res.status(400).send('Invalid payload format: missing repository information');
      return;
    }

    // Extract branch name from ref (refs/heads/master -> master)
    branch = payload.ref ? payload.ref.replace('refs/heads/', '') : DEFAULT_BRANCH;

    // Extract useful commit information — prefer payload.after for exact deployed SHA
    commitSha = payload.after || payload.head_commit?.id || 'unknown';
    const commitMessage = payload.head_commit?.message || 'No commit message';
    const commitAuthor = payload.head_commit?.author?.username || payload.head_commit?.author?.name || 'unknown';

    // Check if commit message contains skip deployment marker
    if (commitMessage.toLowerCase().includes('[skip deploy]') ||
      commitMessage.toLowerCase().includes('[no deploy]')) {
      console.log(`Skipping deployment due to [skip deploy] or [no deploy] in commit message`);
      skipDeployment = true;
    }

    console.log(`Processing push event for repository: ${repository}`);
    console.log(`Branch: ${branch}, Commit: ${commitSha.substring(0, 8)}`);
    console.log(`Message: "${commitMessage}" by ${commitAuthor}`);

    // Log modified files for reference
    if (payload.head_commit?.modified && payload.head_commit.modified.length > 0) {
      console.log(`Modified files (${payload.head_commit.modified.length}):`);
      payload.head_commit.modified.forEach((file: string) => console.log(` - ${file}`));
    }
  }

  // Extract owner and repo name
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    console.error(`Invalid repository format: ${repository}, expected format: owner/repo`);
    res.status(400).send('Invalid repository format');
    return;
  }

  // Get repository-specific configuration
  let repoConfig = getRepoConfig(repository);
  console.log(`Config in use for ${repository}:`, repoConfig);

  process.env = { ...process.env, ...repoConfig?.env_vars };

  // Construct repository URL and name
  const repoName = repo.replace(/\.git$/, '');
  const httpsUrl = `https://github.com/${owner}/${repo}`;
  const sshUrl = `git@github.com:${owner}/${repo}`;
  const cloneUrl = process.env.USE_SSH === 'true' ? sshUrl : httpsUrl;

  // Check if deployment should be skipped
  const shouldDeploy = !skipDeployment && branch === repoConfig.branch;

  // For non-default branches or skipped deployments, still update code but don't deploy
  if (!shouldDeploy) {
    console.log(`Skipping deployment - branch: ${branch}, skipFlag: ${skipDeployment}`);
    res.status(200).send(`Webhook received, deployment skipped for branch: ${branch}`);
    return;
  }

  // Send immediate response for deployments
  res.status(200).send('Webhook received, deployment started');

  const startTime = Date.now();

  // Resolve GitHub Deployment config (if enabled)
  const ghDepCfg = repoConfig.github_deployment?.enabled
    ? resolveDeploymentConfig(repoConfig.github_deployment, repository)
    : null;

  // Open a per-repo log file when the monitoring URL was auto-generated so the
  // monitoring endpoint can serve it directly instead of filtering pm2 logs.
  let logStream: fs.WriteStream | undefined;
  if (ghDepCfg?.deploymentTs) {
    const logDir = path.join(process.cwd(), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    // Sanitize path segments to prevent path traversal from crafted repo names
    const safeOwner = owner.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeRepoName = repoName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const logPath = path.join(logDir, `${safeOwner}_${safeRepoName}_${ghDepCfg.deploymentTs}.log`);
    logStream = fs.createWriteStream(logPath, { flags: 'a' });
    logStream.write(`=== Deployment of ${repository} @ ${commitSha.substring(0, 8)} started at ${new Date().toISOString()} ===\n`);
  }

  // Create GitHub deployment and mark as in_progress (best-effort)
  // Skip if commit SHA could not be resolved — an invalid ref would be rejected by GitHub anyway.
  let ghDeploymentId: number | null = null;
  if (ghDepCfg) {
    if (commitSha === 'unknown') {
      console.warn('[github-deployment] Skipping GitHub Deployment creation: commit SHA could not be determined from push payload.');
    } else {
      ghDeploymentId = await createGitHubDeployment(owner, repoName, commitSha, ghDepCfg);
      if (ghDeploymentId !== null) {
        await createGitHubDeploymentStatus(owner, repoName, ghDeploymentId, 'in_progress', ghDepCfg);
      }
    }
  }

  let deploymentFailed = false;
  try {
    console.log(`Cloning/pulling from: ${cloneUrl}`);

    const repoDir = path.join(process.cwd(), 'repos', `${owner}_${repoName}`);

    logStream?.write(`[git] Cloning/pulling from: ${cloneUrl}\n`);
    await cloneOrPullRepository(cloneUrl, repoDir, repoConfig);
    console.log(`Successfully pulled latest changes for ${repository}`);
    logStream?.write(`[git] Successfully pulled latest changes\n`);

    if (repoConfig.commands && repoConfig.commands.length > 0) {
      console.log(`Starting deployment commands for "${repository}" in directory: ${repoDir}`);

      for (const command of repoConfig.commands) {
        logStream?.write(`\n[command] ${command}\n`);
        await executeDeployment(command, repoDir, repoConfig.timeout, logStream);
      }

      console.log('Deployment completed successfully!');
    } else {
      console.log(`No deployment commands to execute for "${repository}"`);
    }

    // Report success to GitHub
    if (ghDepCfg && ghDeploymentId !== null) {
      await createGitHubDeploymentStatus(owner, repoName, ghDeploymentId, 'success', ghDepCfg);
    }

    // Send health check if configured
    if (repoConfig.health_check_url) {
      try {
        const response = await fetch(repoConfig.health_check_url);

        if (!response.ok) {
          console.error(`Health check failed for ${repository}: ${response.status} ${response.statusText}`);
        } else {
          console.log(`Health check passed for ${repository}`);
        }
      } catch (error) {
        console.error(`Health check failed for ${repository}: ${error}`);
      }
    }
  } catch (error) {
    deploymentFailed = true;
    console.error('Deployment failed:', error instanceof Error ? error.message : String(error));
    logStream?.write(`\n[error] ${error instanceof Error ? error.message : String(error)}\n`);

    // Report failure to GitHub (best-effort)
    if (ghDepCfg && ghDeploymentId !== null) {
      await createGitHubDeploymentStatus(owner, repoName, ghDeploymentId, 'failure', ghDepCfg);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Processing "${repository}" completed in ${duration}s`);

  // Write final marker so the monitoring endpoint knows streaming can stop
  if (logStream) {
    const finalLine = deploymentFailed
      ? `\n=== Deployment FAILED after ${duration}s ===\n`
      : `\n=== Deployment COMPLETED in ${duration}s ===\n`;
    logStream.write(finalLine + '[DEPLOYMENT DONE]\n', () => logStream.end());
  }
}
