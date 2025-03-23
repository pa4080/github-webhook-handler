import { Request, Response } from 'express';
import path from 'path';
import { WebhookPayload } from '../types';
import { verifySignature } from '../utils/webhook';
import { getCommandForRepository } from '../config';
import { cloneOrPullRepository } from '../utils/git';
import { executeDeployment } from '../utils/deployment';

/**
 * Handle webhook requests from GitHub
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const payload = req.body as WebhookPayload;
  
  console.log('Received webhook:', JSON.stringify(payload, null, 2));
  
  // Verify signature if webhook secret is configured
  if (!verifySignature(payload, signature)) {
    console.error('Invalid webhook signature');
    res.status(401).send('Invalid signature');
    return;
  }
  
  // Validate payload and check for supported events
  if (!payload.event) {
    console.error('Invalid webhook payload format: missing event');
    res.status(400).send('Invalid payload format: missing event');
    return;
  }
  
  // Only process supported events
  const supportedEvents = ['push', 'pull_request'];
  if (!supportedEvents.includes(payload.event)) {
    console.log(`Ignoring unsupported event: ${payload.event}`);
    res.status(200).send('Event ignored');
    return;
  }
  
  // Extract repository information based on event type
  let repository = '';
  
  if (payload.event === 'pull_request') {
    if (!payload.pull_request) {
      console.error('Invalid pull_request payload: missing pull_request data');
      res.status(400).send('Invalid pull_request payload');
      return;
    }
    repository = payload.repository;
    
    // For pull_request events, check for specific actions we want to process
    const supportedActions = ['opened', 'synchronize', 'closed', 'reopened'];
    if (payload.action && !supportedActions.includes(payload.action)) {
      console.log(`Ignoring pull_request action: ${payload.action}`);
      res.status(200).send(`Pull request action ignored: ${payload.action}`);
      return;
    }
    
    console.log(`Processing pull_request ${payload.action || 'event'} for PR #${payload.pull_request.number} in repository: ${repository}`);
  } else if (payload.event === 'push') {
    if (!payload.repository) {
      console.error('Invalid push payload: missing repository');
      res.status(400).send('Invalid payload format: missing repository');
      return;
    }
    repository = payload.repository;
    console.log(`Processing push event for repository: ${repository}, ref: ${payload.ref || 'unknown'}`);
  }
  
  // Generate repository URL from the repository name
  // Format will be owner/repo, such as 'pa4080/exc.js-marker-detector'
  console.log(`Repository from payload: ${repository}`);
  
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
  
  // Look for a matching deployment command in config
  const deployCommand = getCommandForRepository(repository);
  if (!deployCommand) {
    console.log(`No specific deployment command found for ${repository}, will only clone/pull`);
  } else {
    console.log(`Found deployment command for ${repository}`);
  }

  // Send immediate response
  res.status(200).send('Webhook received, deployment started');
  
  try {
    // Create repository directory path using the repo name
    const repoDir = path.join(process.cwd(), 'repos', `${owner}-${repoName}`);
    
    // Prefer SSH URL for private repos, but fall back to HTTPS
    // The SSH key must be properly configured for this to work
    const cloneUrl = process.env.USE_SSH === 'true' ? sshUrl : httpsUrl;
    console.log(`Cloning/pulling from: ${cloneUrl}`);
    
    // Clone or pull repository
    await cloneOrPullRepository(cloneUrl, repoDir);
    
    // Execute deployment command if available
    if (deployCommand) {
      await executeDeployment(deployCommand, repoDir);
    } else {
      console.log(`No deployment command to execute for ${repository}`);
    }
  } catch (error) {
    console.error('Deployment failed:', error);
  }
}
