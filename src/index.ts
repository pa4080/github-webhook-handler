import express, { Express, Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { PORT } from './config';
import routes from './routes';

// Create Express application
const app: Express = express();

// Standard middleware for JSON parsing with raw body capture
app.use(bodyParser.json({
  verify: (req: Request & { rawBody?: string }, res: Response, buf: Buffer) => {
    // Capture raw body for signature verification
    req.rawBody = buf.toString();
  }
}));


// Mount routes
app.use('/', routes);

// Create repos directory if it doesn't exist
const reposDir = path.join(process.cwd(), 'repos');
if (!fs.existsSync(reposDir)) {
  fs.mkdirSync(reposDir, { recursive: true });
}

// Start the server
app.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
});
