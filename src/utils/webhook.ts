import crypto from 'crypto';
import { WebhookPayload } from '../types';
import { WEBHOOK_SECRET } from '../config';

/**
 * Verify the GitHub webhook signature
 * @param payload The webhook payload
 * @param signature The signature from X-Hub-Signature-256 header
 * @returns Boolean indicating if the signature is valid
 */
export function verifySignature(payload: WebhookPayload, signature?: string): boolean {
  // If no secret or signature, verification fails
  if (!WEBHOOK_SECRET || !signature) {
    return false;
  }
  
  try {
    // Create HMAC with the webhook secret
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    // Generate digest from payload
    const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');
    
    // Compare the generated digest with the provided signature
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}
