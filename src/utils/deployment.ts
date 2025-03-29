import { spawn } from 'child_process';

/**
 * Execute a deployment command in the specified directory with real-time output
 * @param command The command to execute
 * @param cwd Working directory for command execution
 * @returns Promise that resolves when the process exits
 */
export async function executeDeployment(command: string, cwd: string): Promise<void> {
  console.log(`Executing deployment command in "${cwd}": "${command}"..`);

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

    // Handle stdout in real-time
    child.stdout.on('data', (data) => {
      process.stdout.write(data); // Write to console in real-time
    });

    // Handle stderr in real-time
    child.stderr.on('data', (data) => {
      process.stderr.write(data); // Write errors to console in real-time
    });

    // Handle process exit
    child.on('close', (code) => {
      if (code === 0) {
        console.log('Deployment completed successfully!');
        resolve();
      } else {
        reject(new Error(`Deployment command failed with exit code ${code}`));
      }
    });

    // Handle errors
    child.on('error', (error) => {
      console.error('Failed to start process:', error);
      reject(error);
    });
  });
}
