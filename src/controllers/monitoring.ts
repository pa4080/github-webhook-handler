import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { verifyMonitoringToken } from '../utils/github-deployment';

/** Sentinel written to the log file once a deployment finishes. */
const DEPLOYMENT_DONE_MARKER = '[DEPLOYMENT DONE]';

/** How often (ms) to poll the log file for new content while tailing. */
const TAIL_POLL_INTERVAL_MS = 500;

/** Maximum time (ms) to keep a tail-stream open (60 minutes). */
const TAIL_MAX_DURATION_MS = 60 * 60 * 1000;

/**
 * Sanitize a path segment (owner or repo name) so it cannot be used for
 * path-traversal attacks. Keeps only alphanumeric characters, hyphens,
 * underscores and dots; everything else is replaced with an underscore.
 */
function sanitizePathSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function isAuthorized(req: Request): { ok: boolean; repo?: string; ts?: string } {
  const monitoringSecret = process.env.MONITORING_SECRET;
  if (!monitoringSecret) return { ok: false };

  // New: per-deployment HMAC token with repo filtering
  const { token, repo, ts } = req.query as Record<string, string>;
  if (token && repo && ts) {
    const ok = verifyMonitoringToken(token, repo, ts, monitoringSecret);
    return ok ? { ok: true, repo, ts } : { ok: false };
  }

  // Legacy: plain ?secret= parameter (no repo filtering)
  const secret = req.query.secret as string;
  if (secret === monitoringSecret) {
    return { ok: true };
  }

  return { ok: false };
}

/**
 * Stream a per-repo log file to the response.
 * Sends existing content immediately, then polls for new lines until the
 * [DEPLOYMENT DONE] marker appears or the client disconnects.
 */
function serveLogFile(logPath: string, req: Request, res: Response): void {
  if (!fs.existsSync(logPath)) {
    res.write('Deployment log not yet available. The deployment may not have started yet.\n');
    res.end();
    return;
  }

  // Send all content written so far
  const existing = fs.readFileSync(logPath, 'utf8');
  res.write(existing);

  // If the deployment has already finished, nothing more to tail
  if (existing.includes(DEPLOYMENT_DONE_MARKER)) {
    res.end();
    return;
  }

  // Tail: poll for new content until the done marker is written.
  // Use the file's byte size (from stat) as the initial position so that the
  // position always stays aligned with OS byte offsets even for multi-byte chars.
  let position = fs.statSync(logPath).size;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    clearInterval(pollInterval);
    clearTimeout(maxTimeout);
    res.end();
  };

  const pollInterval = setInterval(() => {
    if (done) return;
    try {
      const stat = fs.statSync(logPath);
      if (stat.size > position) {
        const length = stat.size - position;
        const buf = Buffer.alloc(length);
        const fd = fs.openSync(logPath, 'r');
        try {
          fs.readSync(fd, buf, 0, length, position);
        } finally {
          fs.closeSync(fd);
        }
        const chunk = buf.toString('utf8');
        res.write(chunk);
        position = stat.size;
        if (chunk.includes(DEPLOYMENT_DONE_MARKER)) {
          finish();
        }
      }
    } catch {
      // File read error — stop tailing gracefully
      finish();
    }
  }, TAIL_POLL_INTERVAL_MS);

  const maxTimeout = setTimeout(() => {
    res.write('\n[Log stream timed out]\n');
    finish();
  }, TAIL_MAX_DURATION_MS);

  req.on('close', finish);
}

/**
 * Stream the general pm2 log to the response (legacy / unfiltered path).
 */
function servePm2Log(req: Request, res: Response): void {
  const logProcess = spawn('/usr/local/bin/pm2', ['logs', 'webhook']);

  // Ensure the child stream is decoded as UTF‑8 before piping
  logProcess.stdout.setEncoding('utf8');
  logProcess.stderr.setEncoding('utf8');

  logProcess.stdout.pipe(res, { end: false });
  logProcess.stderr.pipe(res, { end: false });

  // Stop the log stream when the client disconnects
  req.on('close', () => {
    console.log('Client disconnected, killing log process');
    logProcess.kill('SIGTERM');
  });

  // Handle errors
  logProcess.on('error', (err) => {
    res.status(500).send(`Failed to run command: ${err.message}`);
  });

  // Optionally log when the process ends
  logProcess.on('exit', (code) => {
    console.log(`pm2 logs process exited with code ${code}`);
  });
}

export function handleMonitoring(req: Request, res: Response) {
  const auth = isAuthorized(req);
  if (!auth.ok) {
    res.redirect('/health');
    return;
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  if (auth.repo && auth.ts) {
    // Per-deployment path: serve the repo-scoped log file written during deployment
    const [rawOwner, rawRepoName] = auth.repo.split('/');
    const owner = sanitizePathSegment(rawOwner ?? '');
    const repoName = sanitizePathSegment(rawRepoName ?? '');
    const logPath = path.join(process.cwd(), 'logs', `${owner}_${repoName}_${auth.ts}.log`);
    serveLogFile(logPath, req, res);
  } else {
    // Legacy path: stream the live pm2 log
    servePm2Log(req, res);
  }
};
