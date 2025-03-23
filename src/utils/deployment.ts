import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Execute a deployment command in the specified directory
 * @param command The command to execute
 * @param cwd Working directory for command execution
 * @returns Promise with command output
 */
export async function executeDeployment(command: string, cwd: string): Promise<string> {
  console.log(`Executing deployment command in ${cwd}: ${command}`);
  
  try {
    const { stdout, stderr } = await execAsync(command, { cwd });
    
    if (stderr) {
      console.warn('Deployment command stderr:', stderr);
    }
    
    console.log('Deployment output:', stdout);
    console.log('Deployment completed successfully');
    
    return stdout;
  } catch (error) {
    console.error('Deployment command failed:', error);
    throw error;
  }
}
