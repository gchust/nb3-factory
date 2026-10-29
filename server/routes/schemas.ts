import { z } from 'zod';

import type { LeaveRequestView, LeaveStats } from '../providers/leave.js';
import { leaveStatuses, leaveTypes } from '../providers/leave.js';

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Use YYYY-MM-DD.');

export const LeaveParams = z.object({ requestId: z.string().min(1) });

export const LeaveListQuery = z.object({
  scope: z.enum(['mine', 'team']).default('mine'),
  status: z.enum(leaveStatuses).optional(),
  type: z.enum(leaveTypes).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const LeaveCalendarQuery = z.object({
  month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u),
});

export const CreateLeaveInput = z.strictObject({
  type: z.enum(leaveTypes),
  startDate: calendarDate,
  endDate: calendarDate,
  reason: z.string().trim().min(3).max(1000),
});

export const DecideLeaveInput = z.strictObject({
  status: z.enum(['approved', 'rejected']),
  comment: z.string().trim().max(1000).optional(),
});

export const LeaveRequest: z.ZodType<LeaveRequestView> = z
  .object({
    id: z.string(),
    userId: z.string(),
    userName: z.string(),
    type: z.enum(leaveTypes),
    startDate: calendarDate,
    endDate: calendarDate,
    days: z.number().int().min(1),
    reason: z.string(),
    status: z.enum(leaveStatuses),
    reviewerId: z.string().nullable(),
    reviewerName: z.string().nullable(),
    reviewComment: z.string().nullable(),
    submittedAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
  })
  .meta({ ref: 'LeaveRequest' });

export const LeaveStatsSchema: z.ZodType<LeaveStats> = z
  .object({
    pending: z.number().int().min(0),
    approved: z.number().int().min(0),
    yearTotal: z.number().int().min(0),
    teamPending: z.number().int().min(0).nullable(),
  })
  .meta({ ref: 'LeaveStats' });

export const LeaveListMeta = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});

export const LeaveCalendarMeta = z.object({
  month: z.string(),
  total: z.number().int().min(0),
});
