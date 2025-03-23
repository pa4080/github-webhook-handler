import fs from 'fs';
import path from 'path';
import { RepoConfig, ReposConfig } from './types';

// SSH configuration
export const SSH_PRIVATE_KEY_PATH = process.env.SSH_PRIVATE_KEY_PATH || '';
export const SSH_KEY_PASSPHRASE = process.env.SSH_KEY_PASSPHRASE || undefined;

// App supported events
export const APP_SUPPORTED_EVENTS = ['push', 'pull_request', 'ping'];

export function getRepoConfig(repoName: string): RepoConfig | null {
  const configPath = path.join(process.cwd(), 'repos', 'config.json');
  
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ReposConfig;
      return config[repoName] || null;
    }
    return null;
  } catch (error) {
    console.error(`Error reading config for ${repoName}:`, error);
    return null;
  }
}
