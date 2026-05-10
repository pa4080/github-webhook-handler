import path from 'path';
import fs from 'fs';
import { getReposDir, getRepoConfig, DEFAULT_CONFIG } from './config';

describe('getReposDir', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.REPOS_DIR;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns <cwd>/repos when REPOS_DIR is not set', () => {
    expect(getReposDir()).toBe(path.join(process.cwd(), 'repos'));
  });

  it('returns the absolute REPOS_DIR path as-is when it is absolute', () => {
    process.env.REPOS_DIR = '/var/lib/webhook/repos';
    expect(getReposDir()).toBe('/var/lib/webhook/repos');
  });

  it('resolves a relative REPOS_DIR against cwd', () => {
    process.env.REPOS_DIR = 'custom-repos';
    expect(getReposDir()).toBe(path.resolve(process.cwd(), 'custom-repos'));
  });
});

describe('getRepoConfig', () => {
  const tmpDir = path.join(process.cwd(), 'test-repos-tmp');
  const configPath = path.join(tmpDir, 'config.json');
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, REPOS_DIR: tmpDir };
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(obj: object) {
    fs.writeFileSync(configPath, JSON.stringify(obj));
  }

  it('returns DEFAULT_CONFIG when repo is not in config', () => {
    writeConfig({ 'other/repo': { branch: 'main', commands: [] } });
    expect(getRepoConfig('missing/repo', 'main')).toEqual(DEFAULT_CONFIG);
  });

  it('returns single-object config without branch arg (backward-compat)', () => {
    writeConfig({ 'acme/app': { branch: 'main', commands: ['pnpm build'] } });
    const cfg = getRepoConfig('acme/app');
    expect(cfg.branch).toBe('main');
    expect(cfg.commands).toEqual(['pnpm build']);
  });

  it('returns single-object config when branch matches', () => {
    writeConfig({ 'acme/app': { branch: 'main', commands: ['pnpm build'] } });
    const cfg = getRepoConfig('acme/app', 'main');
    expect(cfg.branch).toBe('main');
  });

  it('returns DEFAULT_CONFIG when config file does not exist', () => {
    expect(getRepoConfig('acme/app', 'main')).toEqual(DEFAULT_CONFIG);
  });

  describe('array config', () => {
    it('returns matching entry when branch matches', () => {
      writeConfig({
        'acme/app': [
          { branch: 'main', commands: ['pnpm build:prod'] },
          { branch: 'staging', commands: ['pnpm build:staging'] },
        ],
      });
      const cfg = getRepoConfig('acme/app', 'staging');
      expect(cfg.branch).toBe('staging');
      expect(cfg.commands).toEqual(['pnpm build:staging']);
    });

    it('returns DEFAULT_CONFIG when branch does not match any array entry', () => {
      writeConfig({
        'acme/app': [
          { branch: 'main', commands: ['pnpm build'] },
          { branch: 'staging', commands: ['pnpm build:staging'] },
        ],
      });
      expect(getRepoConfig('acme/app', 'feature-x')).toEqual(DEFAULT_CONFIG);
    });

    it('returns DEFAULT_CONFIG for empty array', () => {
      writeConfig({ 'acme/app': [] });
      expect(getRepoConfig('acme/app', 'main')).toEqual(DEFAULT_CONFIG);
    });

    it('throws when no branch arg is given for an array entry', () => {
      writeConfig({
        'acme/app': [{ branch: 'main', commands: ['pnpm build'] }],
      });
      expect(() => getRepoConfig('acme/app')).toThrow('no branch was provided');
    });

    it('merges DEFAULT_CONFIG with matched array entry', () => {
      writeConfig({
        'acme/app': [{ branch: 'main', commands: ['pnpm build'] }],
      });
      const cfg = getRepoConfig('acme/app', 'main');
      expect(cfg.env_vars).toEqual(DEFAULT_CONFIG.env_vars);
      expect(cfg.commands).toEqual(['pnpm build']);
    });
  });
});
