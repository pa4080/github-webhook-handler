import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';
import { SSH_PRIVATE_KEY_PATH, SSH_KEY_PASSPHRASE } from '../config';
import { RepoConfig } from '../types';

/**
 * Configure and return a SimpleGit instance with SSH support
 * @param repoConfig Optional repository configuration for SSH settings
 */
export function setupGit(repoConfig?: RepoConfig): SimpleGit {
  const git = simpleGit();
  
  // Determine SSH key path and passphrase to use
  const sshKeyPath = repoConfig?.ssh_key_path || SSH_PRIVATE_KEY_PATH;
  const sshPassphrase = repoConfig?.ssh_key_passphrase || SSH_KEY_PASSPHRASE;
  
  // Configure SSH if a private key is provided
  if (sshKeyPath && fs.existsSync(sshKeyPath)) {
    let sshCommand = `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no`;
    
    // Add passphrase if provided
    if (sshPassphrase) {
      sshCommand = `sshpass -p "${sshPassphrase}" ${sshCommand}`;
    }
    
    git.env('GIT_SSH_COMMAND', sshCommand);
  }
  
  return git;
}

/**
 * Clone or pull a repository
 * @param repoUrl Repository URL
 * @param targetDir Target directory for the repository
 * @param repoConfig Optional repository configuration
 */
export async function cloneOrPullRepository(repoUrl: string, targetDir: string, repoConfig?: RepoConfig): Promise<void> {
  const git = setupGit(repoConfig);
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  try {
    // Check if repository exists
    if (fs.existsSync(path.join(targetDir, '.git'))) {
      console.log('Repository exists, pulling latest changes');
      await git.cwd(targetDir).pull();
    } else {
      console.log('Repository does not exist, cloning');
      await git.clone(repoUrl, targetDir);
    }
  } catch (error) {
    console.error('Error cloning/pulling repository:', error);
    throw error;
  }
}
