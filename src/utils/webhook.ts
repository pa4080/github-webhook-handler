import crypto from 'crypto';
import { WEBHOOK_SECRET } from '../config';

/**
 * Verify the GitHub webhook signature
 * @param payload The raw webhook payload as a string
 * @param signature The signature from X-Hub-Signature-256 header
 * @returns Boolean indicating if the signature is valid
 */
export function verifySignature(rawPayload: string, signature?: string): boolean {
  // If no secret is configured or no signature provided, verification fails
  if (!WEBHOOK_SECRET || !signature) {
    console.error('Webhook signature verification failed: Missing secret or signature');
    return false;
  }
  
  // Ensure signature has the expected format
  if (!signature.startsWith('sha256=')) {
    console.error('Invalid signature format: expected sha256= prefix');
    return false;
  }
  
  try {
    // Create HMAC with the webhook secret
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    // Generate digest from the raw payload
    const digest = 'sha256=' + hmac.update(rawPayload).digest('hex');
    
    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}
