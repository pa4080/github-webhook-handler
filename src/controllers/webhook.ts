import { Request, Response } from 'express';
import path from 'path';
import { verifySignature } from '../utils/webhook';
import { getRepoConfig, APP_SUPPORTED_EVENTS } from '../config';
import { cloneOrPullRepository } from '../utils/git';
import { executeDeployment } from '../utils/deployment';
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
  
  if (!APP_SUPPORTED_EVENTS.includes(payload.event)) {
    console.log(`Ignoring unsupported event: ${payload.event}`);
    res.status(200).send('Event ignored');
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
  let skipDeployment = false;
  
  if (payload.event === 'pull_request') {
    if (!payload.pull_request) {
      console.error('Invalid pull_request payload: missing pull_request data');
      res.status(400).send('Invalid pull_request payload');
      return;
    }
    
    // Extract repository from GitHub's pull_request payload format
    if (payload.repository?.full_name) {
      repository = payload.repository.full_name;
    } else {
      console.error('Invalid pull_request payload: missing repository.full_name');
      res.status(400).send('Invalid pull_request payload: missing repository information');
      return;
    }
    
    // Extract branch information
    branch = payload.pull_request.base?.ref || '';
    
    // For pull_request events, check for specific actions we want to process
    const supportedActions = ['opened', 'synchronize', 'closed', 'reopened'];
    if (payload.action && !supportedActions.includes(payload.action)) {
      console.log(`Ignoring pull_request action: ${payload.action}`);
      res.status(200).send(`Pull request action ignored: ${payload.action}`);
      return;
    }
    
    // Get PR title and author for logging
    const prTitle = payload.pull_request.title || 'No title';
    const prAuthor = payload.pull_request.user?.login || 'unknown';
    
    console.log(`Processing pull_request ${payload.action || 'event'} for PR #${payload.pull_request.number}`);
    console.log(`Title: "${prTitle}" by ${prAuthor}`);
    console.log(`Repository: ${repository}, Target branch: ${branch}`);
    
    // For PRs, we typically only want to deploy on merge to main branch
    if (payload.action === 'closed' && payload.pull_request.merged && 
        (branch === 'main' || branch === 'master')) {
      console.log(`PR #${payload.pull_request.number} was merged to ${branch}, proceeding with deployment`);
    } else {
      skipDeployment = true;
      console.log(`PR event does not require deployment (${payload.action}, merged: ${payload.pull_request.merged || false})`);
    }
  } else if (payload.event === 'push') {
    // Extract repository from GitHub's push payload format
    if (payload.repository?.full_name) {
      repository = payload.repository.full_name;
    } else {
      console.error('Invalid push payload: missing repository.full_name');
      res.status(400).send('Invalid payload format: missing repository information');
      return;
    }
    
    // Extract branch name from ref (refs/heads/master -> master)
    branch = payload.ref ? payload.ref.replace('refs/heads/', '') : '';
    
    // Extract useful commit information
    const commitSha = payload.head_commit?.id || payload.after || 'unknown';
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
  
  // Check if this is a default branch (main or master) we want to deploy
  const isDefaultBranch = branch === 'main' || branch === 'master';
  const shouldDeploy = isDefaultBranch && !skipDeployment;
  
  // Extract owner and repo name
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    console.error(`Invalid repository format: ${repository}, expected format: owner/repo`);
    res.status(400).send('Invalid repository format');
    return;
  }

  // Construct repository URL and name
  const repoName = repo.replace(/\.git$/, '');
  const httpsUrl = `https://github.com/${owner}/${repo}`;
  const sshUrl = `git@github.com:${owner}/${repo}`;
  
  // Get repository-specific configuration
  let repoConfig = getRepoConfig(repository);
  if (repoConfig) {
    console.log(`Using custom config for ${repository}`);
    
    // Apply config settings
    if (repoConfig.env_vars) {
      process.env = { ...process.env, ...repoConfig.env_vars };
    }
    
    // Use configured branch if exists
    branch = repoConfig.branch || branch;
    
    // Check if this event is supported by the repository config
    if (repoConfig.repo_supported_events && 
        !repoConfig.repo_supported_events.includes(payload.event)) {
      console.log(`Event ${payload.event} is not supported by repository config`);
      res.status(200).send(`Event ${payload.event} is not supported for this repository`);
      return;
    }
  } else {
    console.log(`No custom config found for ${repository}, using defaults`);
    // Set default config to avoid null checks later
    const defaultConfig: RepoConfig = {
      branch: branch,
      commands: [],
      env_vars: {},
      repo_supported_events: APP_SUPPORTED_EVENTS,
    };
    repoConfig = defaultConfig;
  }

  // For non-default branches or skipped deployments, still update code but don't deploy
  if (!shouldDeploy) {
    console.log(`Skipping deployment - branch: ${branch}, skipFlag: ${skipDeployment}`);
    res.status(200).send(`Webhook received, deployment skipped for branch: ${branch}`);
    return;
  }

  // Send immediate response for deployments
  res.status(200).send('Webhook received, deployment started');
  
  try {
    // Create repository directory path using the repo name
    const repoDir = path.join(process.cwd(), 'repos', `${owner}-${repoName}`);
    
    // Prefer SSH URL for private repos, but fall back to HTTPS
    // The SSH key must be properly configured for this to work
    const cloneUrl = process.env.USE_SSH === 'true' ? sshUrl : httpsUrl;
    console.log(`Cloning/pulling from: ${cloneUrl}`);
    
    // Clone or pull repository with repository-specific config
    await cloneOrPullRepository(cloneUrl, repoDir, repoConfig);
    console.log(`Successfully pulled latest changes for ${repository}`);
    
    // Execute pre-deploy commands if configured
    if (repoConfig.pre_deploy_commands?.length) {
      console.log('Running pre-deploy commands:');
      for (const command of repoConfig.pre_deploy_commands) {
        console.log(`Executing: ${command}`);
        await executeDeployment(command, repoDir);
      }
    }
    
    // Execute main deployment command(s)
    if (repoConfig.commands && repoConfig.commands.length > 0) {
      console.log(`Starting deployment for ${repository}...`);
      const startTime = Date.now();
      for (const command of repoConfig.commands) {
        console.log(`Executing deployment command: ${command}`);
        await executeDeployment(command, repoDir);
      }
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`Deployment completed for ${repository} in ${duration}s`);
    } else if (repoConfig.command) {
      console.log(`Starting deployment for ${repository}...`);
      const startTime = Date.now();
      await executeDeployment(repoConfig.command, repoDir);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`Deployment completed for ${repository} in ${duration}s`);
    } else {
      console.log(`No deployment commands to execute for ${repository}`);
    }
    
    // Execute post-deploy commands if configured
    if (repoConfig.post_deploy_commands?.length) {
      console.log('Running post-deploy commands:');
      for (const command of repoConfig.post_deploy_commands) {
        console.log(`Executing: ${command}`);
        await executeDeployment(command, repoDir);
      }
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
    console.error('Deployment failed:', error instanceof Error ? error.message : String(error));
    // You could add notification logic here (e.g., send email, Slack message, etc.)
  }
}
