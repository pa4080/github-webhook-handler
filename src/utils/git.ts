import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs';
import os from 'os';
import path from 'path';

type GitSetup = {
  git: SimpleGit;
  cleanup: () => void;
};

/**
 * Configure and return a SimpleGit instance with SSH support.
 * SSH settings are read from process.env at call time so that per-repo
 * env_vars (already merged into process.env by the webhook controller)
 * are picked up automatically.
 *
 * SSH key resolution (first match wins):
 *   SSH_PRIVATE_KEY      – literal private key content (written to a temp file)
 *   SSH_PRIVATE_KEY_PATH – filesystem path to an existing private key file
 */
export function setupGit(): GitSetup {
  const git = simpleGit();

  const sshPassphrase = process.env.SSH_KEY_PASSPHRASE;
  const sshPrivateKey = process.env.SSH_PRIVATE_KEY;
  const sshPrivateKeyPath = process.env.SSH_PRIVATE_KEY_PATH;

  let keyFilePath: string | undefined;
  let cleanup = () => {};

  if (sshPrivateKey) {
    // SSH_PRIVATE_KEY holds the literal key content – write it to a temp file
    const normalizedKey = sshPrivateKey.replace(/\\n/g, '\n');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-webhook-handler-ssh-'));
    const tempKeyPath = path.join(tempDir, 'id_rsa');

    fs.writeFileSync(
      tempKeyPath,
      normalizedKey.endsWith('\n') ? normalizedKey : `${normalizedKey}\n`,
      { mode: 0o600 }
    );

    keyFilePath = tempKeyPath;
    cleanup = () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    };
  } else if (sshPrivateKeyPath) {
    // SSH_PRIVATE_KEY_PATH holds a path to an existing key file
    keyFilePath = sshPrivateKeyPath;
  }

  if (keyFilePath) {
    let sshCommand = `ssh -i "${keyFilePath}" -o StrictHostKeyChecking=accept-new`;

    if (sshPassphrase) {
      sshCommand = `sshpass -p "${sshPassphrase}" ${sshCommand}`;
    }

    git.env('GIT_SSH_COMMAND', sshCommand);
  }

  return { git, cleanup };
}

/**
 * Clone or pull a repository
 * @param repoUrl Repository URL
 * @param targetDir Target directory for the repository
 */
export async function cloneOrPullRepository(repoUrl: string, targetDir: string): Promise<void> {
  const { git, cleanup } = setupGit();

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
  } finally {
    cleanup();
  }
}
