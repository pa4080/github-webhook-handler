import fs from 'fs';
import os from 'os';
import path from 'path';
import { cloneOrPullRepository, setupGit } from './git';

const mockEnv = jest.fn();
const mockCwd = jest.fn();
const mockPull = jest.fn();
const mockClone = jest.fn();

function getMockGit() {
  return {
    env: mockEnv,
    cwd: mockCwd,
    pull: mockPull,
    clone: mockClone,
  };
}

jest.mock('simple-git', () => {
  return {
    __esModule: true,
    default: jest.fn(() => getMockGit()),
  };
});

function extractKeyPathFromCommand(command: string): string {
  const match = command.match(/ssh -i "([^"]+)"/);
  if (!match) {
    throw new Error(`Could not extract key path from command: ${command}`);
  }

  return match[1];
}

describe('setupGit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SSH_PRIVATE_KEY;
    delete process.env.SSH_PRIVATE_KEY_PATH;
    delete process.env.SSH_KEY_PASSPHRASE;
    mockCwd.mockReturnValue({
      pull: mockPull,
    });
  });

  it('uses SSH_PRIVATE_KEY as a file path when the file exists', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-key-path-'));
    const keyPath = path.join(tempDir, 'id_ed25519');
    fs.writeFileSync(keyPath, 'key');
    process.env.SSH_PRIVATE_KEY = keyPath;

    const { cleanup } = setupGit();

    expect(mockEnv).toHaveBeenCalledWith(
      'GIT_SSH_COMMAND',
      expect.stringContaining(`ssh -i "${keyPath}"`)
    );

    cleanup();
    expect(fs.existsSync(keyPath)).toBe(true);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('uses legacy SSH_PRIVATE_KEY_PATH when provided', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-key-path-'));
    const keyPath = path.join(tempDir, 'id_ed25519');
    fs.writeFileSync(keyPath, 'key');
    process.env.SSH_PRIVATE_KEY_PATH = keyPath;

    const { cleanup } = setupGit();

    expect(mockEnv).toHaveBeenCalledWith(
      'GIT_SSH_COMMAND',
      expect.stringContaining(`ssh -i "${keyPath}"`)
    );

    cleanup();
    expect(fs.existsSync(keyPath)).toBe(true);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes raw SSH_PRIVATE_KEY content to a temporary file and cleans it up', () => {
    process.env.SSH_PRIVATE_KEY =
      '-----BEGIN OPENSSH PRIVATE KEY-----\\nabc123\\n-----END OPENSSH PRIVATE KEY-----';

    const { cleanup } = setupGit();

    const sshCommand = mockEnv.mock.calls[0][1] as string;
    const tempKeyPath = extractKeyPathFromCommand(sshCommand);

    expect(fs.existsSync(tempKeyPath)).toBe(true);
    expect(fs.readFileSync(tempKeyPath, 'utf8')).toBe(
      '-----BEGIN OPENSSH PRIVATE KEY-----\nabc123\n-----END OPENSSH PRIVATE KEY-----\n'
    );

    cleanup();
    expect(fs.existsSync(tempKeyPath)).toBe(false);
  });

  it('preserves actual multiline SSH_PRIVATE_KEY content', () => {
    process.env.SSH_PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
abc123
-----END OPENSSH PRIVATE KEY-----`;

    const { cleanup } = setupGit();

    const sshCommand = mockEnv.mock.calls[0][1] as string;
    const tempKeyPath = extractKeyPathFromCommand(sshCommand);

    expect(fs.readFileSync(tempKeyPath, 'utf8')).toBe(
      '-----BEGIN OPENSSH PRIVATE KEY-----\nabc123\n-----END OPENSSH PRIVATE KEY-----\n'
    );

    cleanup();
    expect(fs.existsSync(tempKeyPath)).toBe(false);
  });
});

describe('cloneOrPullRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SSH_PRIVATE_KEY;
    delete process.env.SSH_PRIVATE_KEY_PATH;
    delete process.env.SSH_KEY_PASSPHRASE;
    mockClone.mockResolvedValue(undefined);
    mockPull.mockResolvedValue(undefined);
    mockCwd.mockReturnValue({
      pull: mockPull,
    });
  });

  it('cleans up temporary SSH key files after cloning', async () => {
    const targetDir = path.join(os.tmpdir(), `git-repo-${Date.now()}`);
    process.env.SSH_PRIVATE_KEY =
      '-----BEGIN OPENSSH PRIVATE KEY-----\\nabc123\\n-----END OPENSSH PRIVATE KEY-----';

    await cloneOrPullRepository('git@github.com:owner/repo.git', targetDir);

    const sshCommand = mockEnv.mock.calls[0][1] as string;
    const tempKeyPath = extractKeyPathFromCommand(sshCommand);

    expect(mockClone).toHaveBeenCalledWith('git@github.com:owner/repo.git', targetDir);
    expect(fs.existsSync(tempKeyPath)).toBe(false);

    fs.rmSync(targetDir, { recursive: true, force: true });
  });
});
