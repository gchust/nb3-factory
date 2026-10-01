import { z } from 'zod';

import { OPPORTUNITY_STAGES } from '../providers/sales-service.js';

/** Optional free text: trimmed, and an empty value becomes `null`. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const customerInputSchema = z.object({
  name: z.string().trim().min(1).max(128),
  industry: optionalText(64),
});

export const customerUpdateSchema = customerInputSchema.partial();

export const contactInputSchema = z.object({
  name: z.string().trim().min(1).max(128),
  phone: optionalText(64),
  email: optionalText(255),
  customerId: z.coerce.number().int().positive(),
});

export const contactUpdateSchema = contactInputSchema.partial();

export const opportunityInputSchema = z.object({
  name: z.string().trim().min(1).max(128),
  customerId: z.coerce.number().int().positive(),
  amount: z.coerce.number().finite().nonnegative(),
  stage: z.enum(OPPORTUNITY_STAGES),
});

export const opportunityUpdateSchema = opportunityInputSchema.partial();

export interface ValidationIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export interface ValidationErrorBody {
  readonly code: 'VALIDATION_ERROR';
  readonly message: string;
  readonly errors: readonly ValidationIssue[];
}

/** The 400 body the client reads to place errors on the matching fields. */
export function validationErrorBody(error: z.ZodError): ValidationErrorBody {
  return {
    code: 'VALIDATION_ERROR',
    message: 'The submitted values are not valid',
    errors: error.issues.map((issue) => ({
      path: issue.path.map((segment) =>
        typeof segment === 'number' ? segment : String(segment),
      ),
      message: issue.message,
    })),
  };
}
