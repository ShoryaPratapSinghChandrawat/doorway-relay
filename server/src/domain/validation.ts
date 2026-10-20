import { z } from 'zod';

export const categorySchema = z.enum(['visitor', 'delivery', 'access', 'other']);
export const prioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export const statusSchema = z.enum(['new', 'assigned', 'acknowledged', 'resolved', 'reopened']);
export const provenanceSchema = z.enum(['ring_live', 'ring_playground', 'ring_simulated', 'manual']);

export const dueAtSchema = z.union([z.iso.datetime({ offset: true }), z.literal(''), z.null()]).optional().transform((value) => value ? new Date(value).toISOString() : null);
export const summarySchema = z.string().trim().min(3).max(180);
export const resolutionNoteSchema = z.string().trim().min(2).max(300);
