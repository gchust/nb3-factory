import { describe, expect, it } from 'vitest';

import {
  actorCapabilities,
  calculateHours,
  canAccessTeam,
  defectRate,
  ProductionError,
  validateDefectQuantities,
  validateReportQuantities,
  type Actor,
} from '../../server/providers/production-domain.js';

function actor(roles: readonly string[], teamId: number | null): Actor {
  return {
    userId: 'u1',
    name: 'User',
    roles: [...roles],
    teamId,
    teamName: null,
  };
}

describe('production domain rules', () => {
  it('computes the standard-time based hours with one decimal', () => {
    expect(calculateHours(10, 12.5)).toBe(2.1);
    expect(calculateHours(1, 60)).toBe(1);
    expect(calculateHours(3, 10)).toBe(0.5);
  });

  it('computes the defect rate with one decimal', () => {
    expect(defectRate(1, 9)).toBe(10);
    expect(defectRate(0, 0)).toBe(0);
    expect(defectRate(1, 2)).toBe(33.3);
  });

  it('derives capabilities from roles', () => {
    const leader = actorCapabilities(actor(['team-leader'], 1));
    expect(leader.canManageWorkOrders).toBe(false);
    expect(leader.canReport).toBe(true);
    expect(leader.canReadAllWorkOrders).toBe(false);

    const supervisor = actorCapabilities(
      actor(['production-supervisor'], null),
    );
    expect(supervisor.canManageWorkOrders).toBe(true);
    expect(supervisor.canReadAllWorkOrders).toBe(true);

    const inspector = actorCapabilities(actor(['quality-inspector'], null));
    expect(inspector.canReport).toBe(false);
    expect(inspector.canManageDefects).toBe(true);
    expect(inspector.canReadAllWorkOrders).toBe(true);

    const admin = actorCapabilities(actor(['system-administrator'], null));
    expect(admin.canManageWorkOrders).toBe(true);
    expect(admin.canManageDefects).toBe(true);
    expect(admin.canReport).toBe(true);
  });

  it('scopes a team leader to its own team only', () => {
    const leader = actorCapabilities(actor(['team-leader'], 7));
    expect(canAccessTeam(leader, 7, 7)).toBe(true);
    expect(canAccessTeam(leader, 7, 8)).toBe(false);
    expect(canAccessTeam(leader, null, 7)).toBe(false);

    const supervisor = actorCapabilities(
      actor(['production-supervisor'], null),
    );
    expect(canAccessTeam(supervisor, null, 8)).toBe(true);
  });

  it('accepts a report whose quantities add up within the remaining quantity', () => {
    expect(
      validateReportQuantities(
        { quantity: 10, qualifiedQuantity: 9, defectQuantity: 1 },
        20,
      ),
    ).toEqual({ quantity: 10, qualifiedQuantity: 9, defectQuantity: 1 });
  });

  it('rejects a mismatched report', () => {
    expect(() =>
      validateReportQuantities(
        { quantity: 10, qualifiedQuantity: 5, defectQuantity: 4 },
        20,
      ),
    ).toThrowError(ProductionError);
    try {
      validateReportQuantities(
        { quantity: 10, qualifiedQuantity: 5, defectQuantity: 4 },
        20,
      );
    } catch (error) {
      expect((error as ProductionError).code).toBe('REPORT_QUANTITY_MISMATCH');
    }
  });

  it('rejects a report beyond the remaining quantity', () => {
    try {
      validateReportQuantities(
        { quantity: 30, qualifiedQuantity: 0, defectQuantity: 30 },
        20,
      );
      throw new Error('expected a rejection');
    } catch (error) {
      expect((error as ProductionError).code).toBe('REPORT_EXCEEDS_REMAINING');
    }
  });

  it('rejects a report on a completed process', () => {
    try {
      validateReportQuantities(
        { quantity: 1, qualifiedQuantity: 1, defectQuantity: 0 },
        0,
      );
      throw new Error('expected a rejection');
    } catch (error) {
      expect((error as ProductionError).code).toBe('PROCESS_COMPLETED');
    }
  });

  it('enforces the defect boundaries', () => {
    expect(validateDefectQuantities({ quantity: 1 }, 1, 10, 0)).toBe(1);
    try {
      validateDefectQuantities({ quantity: 2 }, 1, 10, 0);
      throw new Error('expected a rejection');
    } catch (error) {
      expect((error as ProductionError).code).toBe('DEFECT_EXCEEDS_REPORT');
    }
    try {
      validateDefectQuantities({ quantity: 1 }, 5, 3, 3);
      throw new Error('expected a rejection');
    } catch (error) {
      expect((error as ProductionError).code).toBe('DEFECT_EXCEEDS_PROCESS');
    }
  });
});
