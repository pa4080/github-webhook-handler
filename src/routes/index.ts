import { Router } from 'express';
import { handleWebhook } from '../controllers/webhook';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).send('Webhook server is running');
});

// Webhook endpoint
router.post('/webhook', handleWebhook);

export default router;
