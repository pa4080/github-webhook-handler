import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs';

/**
 * Configure and return a SimpleGit instance with SSH support.
 * SSH settings are read from process.env at call time so that per-repo
 * env_vars (already merged into process.env by the webhook controller)
 * are picked up automatically.
 */
export function setupGit(): SimpleGit {
  const git = simpleGit();

  // Read SSH settings from the environment at call time
  const sshKeyPath = process.env.SSH_PRIVATE_KEY_PATH || '';
  const sshPassphrase = process.env.SSH_KEY_PASSPHRASE;

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
 */
export async function cloneOrPullRepository(repoUrl: string, targetDir: string): Promise<void> {
  const git = setupGit();

  // Create directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  try {
    // Check if repository exists
    if (fs.existsSync(`${targetDir}/.git`)) {
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

