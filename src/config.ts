import fs from 'fs';
import path from 'path';
import { RepoConfig, ReposConfig } from './types';

// SSH configuration
export const SSH_PRIVATE_KEY_PATH = process.env.SSH_PRIVATE_KEY_PATH || '';
export const SSH_KEY_PASSPHRASE = process.env.SSH_KEY_PASSPHRASE || undefined;


// Set default config to avoid null checks later
export const DEFAULT_BRANCH = 'master';
export const DEFAULT_CONFIG: RepoConfig = {
  branch: DEFAULT_BRANCH,
  commands: [],
  env_vars: {},
};

export function getRepoConfig(repoName: string): RepoConfig {
  const configPath = path.join(process.cwd(), 'repos', 'config.json');

  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ReposConfig;
      return !!config[repoName] ? { ...DEFAULT_CONFIG, ...config[repoName] } : DEFAULT_CONFIG;
    }
    return DEFAULT_CONFIG;
  } catch (error) {
    console.error(`Error reading config for ${repoName}:`, error);
    return DEFAULT_CONFIG;
  }
}

