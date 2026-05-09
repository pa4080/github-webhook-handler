import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs';
import os from 'os';
import path from 'path';

type GitSetup = {
  git: SimpleGit;
  cleanup: () => void;
};

function resolveSshPrivateKeyFile(): { keyFilePath?: string; cleanup: () => void } {
  const sshPrivateKey = process.env.SSH_PRIVATE_KEY;
  const legacySshKeyPath = process.env.SSH_PRIVATE_KEY_PATH;

  if (sshPrivateKey) {
    if (fs.existsSync(sshPrivateKey)) {
      return { keyFilePath: sshPrivateKey, cleanup: () => {} };
    }

    const normalizedKey = sshPrivateKey.replace(/\\n/g, '\n');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-webhook-handler-ssh-'));
    const tempKeyPath = path.join(tempDir, 'id_rsa');

    fs.writeFileSync(
      tempKeyPath,
      normalizedKey.endsWith('\n') ? normalizedKey : `${normalizedKey}\n`,
      { mode: 0o600 }
    );

    return {
      keyFilePath: tempKeyPath,
      cleanup: () => {
        fs.rmSync(tempDir, { recursive: true, force: true });
      },
    };
  }

  if (legacySshKeyPath && fs.existsSync(legacySshKeyPath)) {
    return { keyFilePath: legacySshKeyPath, cleanup: () => {} };
  }

  return { cleanup: () => {} };
}

/**
 * Configure and return a SimpleGit instance with SSH support.
 * SSH settings are read from process.env at call time so that per-repo
 * env_vars (already merged into process.env by the webhook controller)
 * are picked up automatically.
 */
export function setupGit(): GitSetup {
  const git = simpleGit();

  // Read SSH settings from the environment at call time
  const sshPassphrase = process.env.SSH_KEY_PASSPHRASE;
  const { keyFilePath, cleanup } = resolveSshPrivateKeyFile();

  // Configure SSH if a private key is provided
  if (keyFilePath) {
    let sshCommand = `ssh -i "${keyFilePath}" -o StrictHostKeyChecking=accept-new`;

    // Add passphrase if provided
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
  } finally {
    cleanup();
  }
}
