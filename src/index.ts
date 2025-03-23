import express from 'express';
import dotenv from 'dotenv';
import { verifySignature } from './utils/webhook';
import { handleWebhook } from './controllers/webhook';
import { APP_SUPPORTED_EVENTS } from './config';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Middleware to capture raw body for webhook signature verification
app.use('/webhook', (req: express.Request & { rawBody?: string }, res: express.Response, next: express.NextFunction) => {
  let rawBody = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { rawBody += chunk; });
  req.on('end', () => {
    req.rawBody = rawBody;
    next();
  });
});

// Webhook route
app.post('/webhook', handleWebhook);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start server
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Supported events: ${APP_SUPPORTED_EVENTS.join(', ')}`);
});
