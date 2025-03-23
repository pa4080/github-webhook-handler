import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Server configuration
export const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
export const USE_SSH = process.env.USE_SSH === 'true';

// SSH configuration
export const SSH_PRIVATE_KEY_PATH = process.env.SSH_PRIVATE_KEY_PATH || '';
export const SSH_KEY_PASSPHRASE = process.env.SSH_KEY_PASSPHRASE || undefined;

/**
 * Get deployment command for a repository
 * This function looks for deployment commands based on the repository name from payload
 */
export function getCommandForRepository(repository: string): string | undefined {
  // Extract repository name without owner
  const repoName = repository.split('/')[1]?.replace(/\.git$/, '');
  if (!repoName) return undefined;
  
  // Look for a command specifically configured for this repository
  // Format in env: REPO_[name]_COMMAND=command
  
  // Try different variations of the repository name to find a matching command
  // 1. Try exact name: REPO_reponame_COMMAND
  // 2. Try uppercase: REPO_REPONAME_COMMAND
  // 3. Try with dashes replaced by underscores: REPO_repo_name_COMMAND
  
  const variations = [
    repoName,
    repoName.toUpperCase(),
    repoName.replace(/-/g, '_'),
    repoName.replace(/-/g, '_').toUpperCase()
  ];
  
  for (const variation of variations) {
    const key = `REPO_${variation}_COMMAND`;
    if (process.env[key]) {
      console.log(`Found command using key: ${key}`);
      return process.env[key];
    }
  }
  
  return undefined;
}
