import { spawn, spawnSync } from 'child_process';
import { Request, Response } from 'express';

export function handleMonitoring(req: Request, res: Response) {
	const secret = req.query.secret as string;
	if (secret === process.env.MONITORING_SECRET && !!process.env.MONITORING_SECRET) {
		res.setHeader('Content-Type', 'text/plain; charset=utf-8');
		res.setHeader('Transfer-Encoding', 'chunked');

		const logProcess = spawn('/usr/local/bin/pm2', ['logs', 'webhook']);

		// Ensure the child stream is decoded as UTF‑8 before piping
		logProcess.stdout.setEncoding('utf8');
		logProcess.stderr.setEncoding('utf8');

		logProcess.stdout.pipe(res);
		logProcess.stderr.pipe(res);

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
	} else {
		res.redirect('/health');
	}
};
