import {
  resolveDeploymentConfig,
  createGitHubDeployment,
  createGitHubDeploymentStatus,
} from './github-deployment';
import { GitHubDeploymentConfig } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns a minimal enabled GitHubDeploymentConfig with all optional fields
 * left unset so that defaults are exercised.
 */
function minimalConfig(overrides: Partial<GitHubDeploymentConfig> = {}): GitHubDeploymentConfig {
  return { enabled: true, ...overrides };
}

// ─── resolveDeploymentConfig ─────────────────────────────────────────────────

describe('resolveDeploymentConfig', () => {
  it('fills in all defaults when only enabled is given', () => {
    const resolved = resolveDeploymentConfig(minimalConfig());
    expect(resolved.environment).toBe('production');
    expect(resolved.description).toBe('Deploying to self-hosted VPS');
    expect(resolved.auto_merge).toBe(false);
    expect(resolved.required_contexts).toEqual([]);
    expect(resolved.transient_environment).toBe(false);
    expect(resolved.production_environment).toBe(true); // default when env=production
    expect(resolved.fail_deployment_on_status_error).toBe(false);
    expect(resolved.environment_url).toBeUndefined();
    expect(resolved.log_url).toBeUndefined();
  });

  it('sets production_environment=false by default when environment != production', () => {
    const resolved = resolveDeploymentConfig(minimalConfig({ environment: 'staging' }));
    expect(resolved.production_environment).toBe(false);
  });

  it('respects explicit production_environment override', () => {
    const resolved = resolveDeploymentConfig(
      minimalConfig({ environment: 'staging', production_environment: true })
    );
    expect(resolved.production_environment).toBe(true);
  });

  it('propagates all optional fields when supplied', () => {
    const cfg = minimalConfig({
      environment: 'staging',
      environment_url: 'https://staging.example.com',
      log_url: 'https://logs.example.com',
      description: 'Custom description',
      auto_merge: true,
      required_contexts: ['ci/build'],
      transient_environment: true,
      production_environment: false,
      fail_deployment_on_status_error: true,
    });
    const resolved = resolveDeploymentConfig(cfg);
    expect(resolved.environment).toBe('staging');
    expect(resolved.environment_url).toBe('https://staging.example.com');
    expect(resolved.log_url).toBe('https://logs.example.com');
    expect(resolved.description).toBe('Custom description');
    expect(resolved.auto_merge).toBe(true);
    expect(resolved.required_contexts).toEqual(['ci/build']);
    expect(resolved.transient_environment).toBe(true);
    expect(resolved.production_environment).toBe(false);
    expect(resolved.fail_deployment_on_status_error).toBe(true);
  });
});

// ─── Octokit mock setup ──────────────────────────────────────────────────────

const mockCreateDeployment = jest.fn();
const mockCreateDeploymentStatus = jest.fn();

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: {
      createDeployment: mockCreateDeployment,
      createDeploymentStatus: mockCreateDeploymentStatus,
    },
  })),
}));

const OWNER = 'pa4080';
const REPO = 'snapix';
const REF = 'abc1234def5678';

// ─── createGitHubDeployment ───────────────────────────────────────────────────

describe('createGitHubDeployment', () => {
  const resolved = resolveDeploymentConfig(minimalConfig());

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null and logs a warning when GITHUB_TOKEN is absent', async () => {
    const originalToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await createGitHubDeployment(OWNER, REPO, REF, resolved);

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('GITHUB_TOKEN is not set'));
    expect(mockCreateDeployment).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    if (originalToken !== undefined) process.env.GITHUB_TOKEN = originalToken;
  });

  it('creates a deployment and returns its id when the token is present', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    mockCreateDeployment.mockResolvedValueOnce({ data: { id: 42 } });

    const result = await createGitHubDeployment(OWNER, REPO, REF, resolved);

    expect(result).toBe(42);
    expect(mockCreateDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: OWNER,
        repo: REPO,
        ref: REF,
        environment: 'production',
        auto_merge: false,
        required_contexts: [],
      })
    );

    delete process.env.GITHUB_TOKEN;
  });

  it('returns null when API returns a merged-branch response (no id)', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    mockCreateDeployment.mockResolvedValueOnce({ data: { message: 'Auto-merged' } });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await createGitHubDeployment(OWNER, REPO, REF, resolved);

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no id'));

    warnSpy.mockRestore();
    delete process.env.GITHUB_TOKEN;
  });

  it('logs error and returns null when API fails and fail_deployment_on_status_error=false', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    mockCreateDeployment.mockRejectedValueOnce(new Error('API error'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await createGitHubDeployment(OWNER, REPO, REF, resolved);

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to create GitHub deployment'));

    errorSpy.mockRestore();
    delete process.env.GITHUB_TOKEN;
  });

  it('throws when API fails and fail_deployment_on_status_error=true', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    const strictCfg = resolveDeploymentConfig(
      minimalConfig({ fail_deployment_on_status_error: true })
    );
    mockCreateDeployment.mockRejectedValueOnce(new Error('API error'));

    await expect(createGitHubDeployment(OWNER, REPO, REF, strictCfg)).rejects.toThrow(
      'Failed to create GitHub deployment'
    );

    delete process.env.GITHUB_TOKEN;
  });
});

// ─── createGitHubDeploymentStatus ────────────────────────────────────────────

describe('createGitHubDeploymentStatus', () => {
  const resolved = resolveDeploymentConfig(minimalConfig());
  const DEPLOYMENT_ID = 42;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns early and logs a warning when GITHUB_TOKEN is absent', async () => {
    const originalToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await createGitHubDeploymentStatus(OWNER, REPO, DEPLOYMENT_ID, 'success', resolved);

    expect(mockCreateDeploymentStatus).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('GITHUB_TOKEN is not set'));

    warnSpy.mockRestore();
    if (originalToken !== undefined) process.env.GITHUB_TOKEN = originalToken;
  });

  it('creates an in_progress status', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    mockCreateDeploymentStatus.mockResolvedValueOnce({});

    await createGitHubDeploymentStatus(OWNER, REPO, DEPLOYMENT_ID, 'in_progress', resolved);

    expect(mockCreateDeploymentStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: OWNER,
        repo: REPO,
        deployment_id: DEPLOYMENT_ID,
        state: 'in_progress',
      })
    );

    delete process.env.GITHUB_TOKEN;
  });

  it('creates a success status with environment_url and log_url when configured', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    mockCreateDeploymentStatus.mockResolvedValueOnce({});
    const cfgWithUrls = resolveDeploymentConfig(
      minimalConfig({
        environment_url: 'https://example.com',
        log_url: 'https://logs.example.com',
      })
    );

    await createGitHubDeploymentStatus(OWNER, REPO, DEPLOYMENT_ID, 'success', cfgWithUrls);

    expect(mockCreateDeploymentStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'success',
        environment_url: 'https://example.com',
        log_url: 'https://logs.example.com',
      })
    );

    delete process.env.GITHUB_TOKEN;
  });

  it('creates a failure status', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    mockCreateDeploymentStatus.mockResolvedValueOnce({});

    await createGitHubDeploymentStatus(OWNER, REPO, DEPLOYMENT_ID, 'failure', resolved);

    expect(mockCreateDeploymentStatus).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'failure' })
    );

    delete process.env.GITHUB_TOKEN;
  });

  it('logs error and does not throw when API fails and fail_deployment_on_status_error=false', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    mockCreateDeploymentStatus.mockRejectedValueOnce(new Error('Network error'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      createGitHubDeploymentStatus(OWNER, REPO, DEPLOYMENT_ID, 'success', resolved)
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to set deployment status'));

    errorSpy.mockRestore();
    delete process.env.GITHUB_TOKEN;
  });

  it('throws when API fails and fail_deployment_on_status_error=true', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    const strictCfg = resolveDeploymentConfig(
      minimalConfig({ fail_deployment_on_status_error: true })
    );
    mockCreateDeploymentStatus.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      createGitHubDeploymentStatus(OWNER, REPO, DEPLOYMENT_ID, 'success', strictCfg)
    ).rejects.toThrow('Failed to set deployment status');

    delete process.env.GITHUB_TOKEN;
  });
});
