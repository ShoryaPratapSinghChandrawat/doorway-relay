import type { ZodType } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../domain/errors.js';

export function parseBody<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, 'validation_error', 'Check the highlighted fields and try again.', parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })));
  }
  return parsed.data;
}

export function validationErrorHandler(error: unknown, _request: Request, _response: Response, next: NextFunction): void {
  next(error);
}
