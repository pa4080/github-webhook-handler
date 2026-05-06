import {
  resolveDeploymentConfig,
  createGitHubDeployment,
  createGitHubDeploymentStatus,
  buildMonitoringToken,
  verifyMonitoringToken,
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

const REPO_FULL_NAME = 'pa4080/snapix';

// ─── resolveDeploymentConfig ─────────────────────────────────────────────────

describe('resolveDeploymentConfig', () => {
  // Ensure env vars used by auto-generation don't bleed between tests
  let originalServerBaseUrl: string | undefined;
  let originalMonitoringSecret: string | undefined;

  beforeEach(() => {
    originalServerBaseUrl = process.env.SERVER_BASE_URL;
    originalMonitoringSecret = process.env.MONITORING_SECRET;
    delete process.env.SERVER_BASE_URL;
    delete process.env.MONITORING_SECRET;
  });

  afterEach(() => {
    if (originalServerBaseUrl !== undefined) process.env.SERVER_BASE_URL = originalServerBaseUrl;
    else delete process.env.SERVER_BASE_URL;
    if (originalMonitoringSecret !== undefined) process.env.MONITORING_SECRET = originalMonitoringSecret;
    else delete process.env.MONITORING_SECRET;
  });

  it('fills in all defaults when only enabled is given', () => {
    const resolved = resolveDeploymentConfig(minimalConfig(), REPO_FULL_NAME);
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
    const resolved = resolveDeploymentConfig(minimalConfig({ environment: 'staging' }), REPO_FULL_NAME);
    expect(resolved.production_environment).toBe(false);
  });

  it('respects explicit production_environment override', () => {
    const resolved = resolveDeploymentConfig(
      minimalConfig({ environment: 'staging', production_environment: true }),
      REPO_FULL_NAME
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
    const resolved = resolveDeploymentConfig(cfg, REPO_FULL_NAME);
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

  // ── log_url auto-generation ────────────────────────────────────────────────

  it('auto-generates log_url with HMAC token, repo, and ts when both env vars are set', () => {
    process.env.SERVER_BASE_URL = 'https://my-server.com';
    process.env.MONITORING_SECRET = 'supersecret';
    const before = Date.now();
    const resolved = resolveDeploymentConfig(minimalConfig(), REPO_FULL_NAME);
    const after = Date.now();

    expect(resolved.log_url).toBeDefined();
    const url = new URL(resolved.log_url!);
    expect(url.origin + url.pathname).toBe('https://my-server.com/monitoring');
    expect(url.searchParams.get('repo')).toBe(REPO_FULL_NAME);
    const ts = url.searchParams.get('ts')!;
    expect(Number(ts)).toBeGreaterThanOrEqual(before);
    expect(Number(ts)).toBeLessThanOrEqual(after);
    const token = url.searchParams.get('token')!;
    expect(token).toBe(buildMonitoringToken('supersecret', REPO_FULL_NAME, ts));
    // deploymentTs must match the ts embedded in the URL
    expect(resolved.deploymentTs).toBe(ts);
  });

  it('strips trailing slash from SERVER_BASE_URL when auto-generating log_url', () => {
    process.env.SERVER_BASE_URL = 'https://my-server.com/';
    process.env.MONITORING_SECRET = 'supersecret';
    const resolved = resolveDeploymentConfig(minimalConfig(), REPO_FULL_NAME);
    expect(resolved.log_url).toMatch(/^https:\/\/my-server\.com\/monitoring\?/);
  });

  it('does not auto-generate log_url when only SERVER_BASE_URL is set (missing MONITORING_SECRET)', () => {
    process.env.SERVER_BASE_URL = 'https://my-server.com';
    const resolved = resolveDeploymentConfig(minimalConfig(), REPO_FULL_NAME);
    expect(resolved.log_url).toBeUndefined();
  });

  it('does not auto-generate log_url when only MONITORING_SECRET is set (missing SERVER_BASE_URL)', () => {
    process.env.MONITORING_SECRET = 'supersecret';
    const resolved = resolveDeploymentConfig(minimalConfig(), REPO_FULL_NAME);
    expect(resolved.log_url).toBeUndefined();
  });

  it('does not set deploymentTs when log_url is explicitly provided', () => {
    process.env.SERVER_BASE_URL = 'https://my-server.com';
    process.env.MONITORING_SECRET = 'supersecret';
    const resolved = resolveDeploymentConfig(minimalConfig({ log_url: 'https://custom-logs.example.com' }), REPO_FULL_NAME);
    expect(resolved.deploymentTs).toBeUndefined();
  });

  it('does not set deploymentTs when env vars for auto-generation are absent', () => {
    const resolved = resolveDeploymentConfig(minimalConfig(), REPO_FULL_NAME);
    expect(resolved.deploymentTs).toBeUndefined();
  });

  it('explicit log_url in config takes precedence over auto-generated one', () => {
    process.env.SERVER_BASE_URL = 'https://my-server.com';
    process.env.MONITORING_SECRET = 'supersecret';
    const resolved = resolveDeploymentConfig(minimalConfig({ log_url: 'https://custom-logs.example.com' }), REPO_FULL_NAME);
    expect(resolved.log_url).toBe('https://custom-logs.example.com');
  });
});

// ─── buildMonitoringToken / verifyMonitoringToken ────────────────────────────

describe('buildMonitoringToken', () => {
  it('produces a 32-char hex string', () => {
    const token = buildMonitoringToken('secret', 'pa4080/snapix', '1234567890');
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is deterministic for the same inputs', () => {
    const t1 = buildMonitoringToken('s', 'owner/repo', '111');
    const t2 = buildMonitoringToken('s', 'owner/repo', '111');
    expect(t1).toBe(t2);
  });

  it('differs when the repo changes', () => {
    const t1 = buildMonitoringToken('s', 'owner/repo-a', '111');
    const t2 = buildMonitoringToken('s', 'owner/repo-b', '111');
    expect(t1).not.toBe(t2);
  });

  it('differs when the timestamp changes (unique per deployment)', () => {
    const t1 = buildMonitoringToken('s', 'owner/repo', '111');
    const t2 = buildMonitoringToken('s', 'owner/repo', '222');
    expect(t1).not.toBe(t2);
  });
});

describe('verifyMonitoringToken', () => {
  const SECRET = 'test-monitoring-secret';
  const REPO = 'pa4080/snapix';
  const TS = '1700000000000';
  const VALID_TOKEN = buildMonitoringToken(SECRET, REPO, TS);

  it('accepts a valid token', () => {
    expect(verifyMonitoringToken(VALID_TOKEN, REPO, TS, SECRET)).toBe(true);
  });

  it('rejects a tampered token', () => {
    const tampered = VALID_TOKEN.slice(0, -1) + (VALID_TOKEN.endsWith('f') ? '0' : 'f');
    expect(verifyMonitoringToken(tampered, REPO, TS, SECRET)).toBe(false);
  });

  it('rejects a token from a different repo', () => {
    const otherToken = buildMonitoringToken(SECRET, 'other/repo', TS);
    expect(verifyMonitoringToken(otherToken, REPO, TS, SECRET)).toBe(false);
  });

  it('rejects a token from a different timestamp', () => {
    const oldToken = buildMonitoringToken(SECRET, REPO, '999');
    expect(verifyMonitoringToken(oldToken, REPO, TS, SECRET)).toBe(false);
  });

  it('rejects when token is empty', () => {
    expect(verifyMonitoringToken('', REPO, TS, SECRET)).toBe(false);
  });

  it('rejects when repo is empty', () => {
    expect(verifyMonitoringToken(VALID_TOKEN, '', TS, SECRET)).toBe(false);
  });

  it('rejects when ts is empty', () => {
    expect(verifyMonitoringToken(VALID_TOKEN, REPO, '', SECRET)).toBe(false);
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
  const resolved = resolveDeploymentConfig(minimalConfig(), REPO_FULL_NAME);

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
      minimalConfig({ fail_deployment_on_status_error: true }),
      REPO_FULL_NAME
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
  const resolved = resolveDeploymentConfig(minimalConfig(), REPO_FULL_NAME);
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
      }),
      REPO_FULL_NAME
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
      minimalConfig({ fail_deployment_on_status_error: true }),
      REPO_FULL_NAME
    );
    mockCreateDeploymentStatus.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      createGitHubDeploymentStatus(OWNER, REPO, DEPLOYMENT_ID, 'success', strictCfg)
    ).rejects.toThrow('Failed to set deployment status');

    delete process.env.GITHUB_TOKEN;
  });
});
