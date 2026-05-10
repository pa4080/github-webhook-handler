import fs from 'fs';
import path from 'path';
import { RepoConfig, ReposConfig } from './types';

// Set default config to avoid null checks later
export const DEFAULT_BRANCH = 'master';
export const DEFAULT_CONFIG: RepoConfig = {
  branch: DEFAULT_BRANCH,
  commands: [],
  env_vars: {},
};

/**
 * Resolve the base directory that holds cloned repositories and config.json.
 *
 * Reads the `REPOS_DIR` environment variable.  When set, the value is used
 * as-is (absolute or relative paths are both accepted; relative paths are
 * resolved against the current working directory).  When the variable is not
 * set the classic default `<cwd>/repos` is used so existing installations
 * continue to work without any changes.
 */
export function getReposDir(): string {
  const envDir = process.env.REPOS_DIR;
  if (envDir) {
    return path.isAbsolute(envDir) ? envDir : path.resolve(process.cwd(), envDir);
  }
  return path.join(process.cwd(), 'repos');
}

export function getRepoConfig(repoName: string, branch?: string): RepoConfig {
  const configPath = path.join(getReposDir(), 'config.json');

  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ReposConfig;
      const entry = config[repoName];

      if (!entry) {
        return DEFAULT_CONFIG;
      }

      // If the entry is an array, find the entry that matches the branch
      if (Array.isArray(entry)) {
        if (!branch) {
          throw new Error(`Config for "${repoName}" is an array but no branch was provided`);
        }
        const match = entry.find(e => e.branch === branch);
        if (!match) {
          console.log(`No array config entry found for ${repoName} branch "${branch}" — skipping`);
          return DEFAULT_CONFIG;
        }
        return { ...DEFAULT_CONFIG, ...match };
      }

      // Single object config (backward compatibility)
      return { ...DEFAULT_CONFIG, ...entry };
    }
    return DEFAULT_CONFIG;
  } catch (error) {
    // Re-throw intentional errors (e.g. misconfigured array entry without branch)
    // and propagate unexpected I/O / parse errors to the caller.
    throw error;
  }
}

