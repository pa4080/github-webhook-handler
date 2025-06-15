import express from 'express';
import dotenv from 'dotenv';
import { handleWebhook } from './controllers/webhook';
import packageJson from '../package.json';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Middleware to capture raw body for webhook signature verification
app.use('/webhook', (req: express.Request & { rawBody?: string; }, res: express.Response, next: express.NextFunction) => {
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
  // res.status(200).send(`Webhook server is running. v.${process.env.npm_package_version}`);
  res.status(200).send(`Webhook server is running. v.${packageJson.version}`);
});


// Start server
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
