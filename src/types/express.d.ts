// Augment the Express Request interface to include rawBody
import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}
