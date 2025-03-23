import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';
import { SSH_PRIVATE_KEY_PATH, SSH_KEY_PASSPHRASE } from '../config';

/**
 * Configure and return a SimpleGit instance with SSH support if available
 */
export function setupGit(): SimpleGit {
  const git = simpleGit();
  
  // Configure SSH if a private key is provided
  if (SSH_PRIVATE_KEY_PATH && fs.existsSync(SSH_PRIVATE_KEY_PATH)) {
    git.env('GIT_SSH_COMMAND', `ssh -i ${SSH_PRIVATE_KEY_PATH} -o StrictHostKeyChecking=no`);
  }
  
  return git;
}

/**
 * Clone or pull a repository
 * @param repoUrl Repository URL
 * @param targetDir Target directory for the repository
 */
export async function cloneOrPullRepository(repoUrl: string, targetDir: string): Promise<void> {
  const git = setupGit();
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  try {
    // Check if repository already exists
    if (fs.existsSync(path.join(targetDir, '.git'))) {
      // Pull latest changes
      console.log(`Pulling latest changes from ${repoUrl}`);
      await git.cwd(targetDir).pull();
    } else {
      // Clone repository
      console.log(`Cloning repository ${repoUrl}`);
      await git.clone(repoUrl, targetDir);
    }
  } catch (error) {
    console.error('Git operation failed:', error);
    throw error;
  }
}
