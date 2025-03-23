import crypto from 'crypto';

/**
 * Verify GitHub webhook signature
 * @param payload Raw webhook payload
 * @param signature X-Hub-Signature-256 header value
 * @returns true if signature is valid, false otherwise
 */
export function verifySignature(payload: string, signature: string | undefined): boolean {
  if (!signature) {
    console.error('No signature provided');
    return false;
  }

  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
  if (!WEBHOOK_SECRET) {
    console.error('WEBHOOK_SECRET environment variable is not set');
    return false;
  }

  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(signature)
  );
}
