import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { Request, Response } from 'express';
import { verifyMonitoringToken } from '../utils/github-deployment';

function isAuthorized(req: Request): { ok: boolean; repo?: string } {
  const monitoringSecret = process.env.MONITORING_SECRET;
  if (!monitoringSecret) return { ok: false };

  // New: per-deployment HMAC token with repo filtering
  const { token, repo, ts } = req.query as Record<string, string>;
  if (token && repo && ts) {
    const ok = verifyMonitoringToken(token, repo, ts, monitoringSecret);
    return ok ? { ok: true, repo } : { ok: false };
  }

  // Legacy: plain ?secret= parameter (no repo filtering)
  const secret = req.query.secret as string;
  if (secret === monitoringSecret) {
    return { ok: true };
  }

  return { ok: false };
}

export function handleMonitoring(req: Request, res: Response) {
  const auth = isAuthorized(req);
  if (!auth.ok) {
    res.redirect('/health');
    return;
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  const logProcess = spawn('/usr/local/bin/pm2', ['logs', 'webhook']);

  // Ensure the child stream is decoded as UTF‑8 before piping
  logProcess.stdout.setEncoding('utf8');
  logProcess.stderr.setEncoding('utf8');

  if (auth.repo) {
    // Filter output to lines that mention this specific repository.
    // Use a regex to avoid false positives from repos that share a name prefix
    // (e.g. "owner/api" should not match "owner/api-v2").
    const escapedRepo = auth.repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const repoPattern = new RegExp(`${escapedRepo}(?![\\w.-])`);
    const filterStream = (readable: NodeJS.ReadableStream) => {
      const rl = createInterface({ input: readable, terminal: false });
      rl.on('line', (line) => {
        if (repoPattern.test(line)) {
          res.write(line + '\n');
        }
      });
      req.on('close', () => rl.close());
    };
    filterStream(logProcess.stdout);
    filterStream(logProcess.stderr);
  } else {
    logProcess.stdout.pipe(res);
    logProcess.stderr.pipe(res);
  }

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
};
