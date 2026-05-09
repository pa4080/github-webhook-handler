import path from 'path';
import { getReposDir } from './config';

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
