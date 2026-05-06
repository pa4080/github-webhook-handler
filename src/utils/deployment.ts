import { spawn } from 'child_process';
import { WriteStream } from 'fs';

/**
 * Execute a deployment command in the specified directory with real-time output
 * @param command The command to execute
 * @param cwd Working directory for command execution
 * @param timeoutSec Optional timeout in seconds; the process is killed if exceeded
 * @param logStream Optional writable stream to tee all output into (in addition to process stdout/stderr)
 * @returns Promise that resolves when the process exits
 */
export async function executeDeployment(command: string, cwd: string, timeoutSec?: number, logStream?: WriteStream): Promise<void> {
  console.log(`Executing command: "${command}"${timeoutSec ? ` (timeout: ${timeoutSec}s)` : ''}`);

  return new Promise((resolve, reject) => {
    // Split command into parts (for cross-platform support)
    const [cmd, ...args] = command.split(' ');

    // Spawn the process
    const child = spawn(cmd, args, {
      cwd,
      env: process.env,
      shell: true, // Needed for executing complex shell commands
      stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout & stderr
    });

    // Kill the child process if it runs longer than the configured timeout
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    if (timeoutSec && timeoutSec > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        console.error(`Command "${command}" timed out after ${timeoutSec}s — sending SIGTERM`);
        child.kill('SIGTERM');
      }, timeoutSec * 1000);
    }

    // Handle stdout in real-time
    child.stdout.on('data', (data) => {
      process.stdout.write(data); // Write to console in real-time
      logStream?.write(data);
    });

    // Handle stderr in real-time
    child.stderr.on('data', (data) => {
      process.stderr.write(data); // Write errors to console in real-time
      logStream?.write(data);
    });

    // Handle process exit
    child.on('close', (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (timedOut) {
        reject(new Error(`Deployment command timed out after ${timeoutSec}s`));
      } else if (code === 0) {
        console.log(`Command "${command}" completed successfully!`);
        resolve();
      } else {
        reject(new Error(`Deployment command failed with exit code ${code}`));
      }
    });

    // Handle errors
    child.on('error', (error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      console.error('Failed to start process:', error);
      reject(error);
    });
  });
}
