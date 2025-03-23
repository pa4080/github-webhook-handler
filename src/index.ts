import express, { Express } from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { PORT } from './config';
import routes from './routes';

// Create Express application
const app: Express = express();

// Middleware
app.use(bodyParser.json());

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
