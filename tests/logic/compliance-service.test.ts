// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createComplianceService } from '../../server/providers/compliance.js';
import { createComplianceRoutes } from '../../server/routes/compliance.js';
import {
  createComplianceTestDatabase,
  organizationIdByCode,
  supplierIdByCode,
  type ComplianceTestDatabase,
} from '../helpers/compliance-db.js';

let db: ComplianceTestDatabase;
let service: ReturnType<typeof createComplianceService>;

beforeAll(async () => {
  db = await createComplianceTestDatabase();
  service = createComplianceService(db.manager, {
    // Stands in for the platform `root` Permission Set an administrator holds in the running application.
    isUnrestricted: async (userId) => userId === 'user-admin',
  });
});

afterAll(async () => {
  await db?.close();
});

async function assign(
  userId: string,
  role: string,
  organizationId?: number,
  supplierId?: number,
) {
  const admin = await service.getAccess('user-admin');
  await service.assignMember(admin, {
    userId,
    role: role as never,
    organizationId: organizationId ?? null,
    supplierId: supplierId ?? null,
  });
}

describe('access context', () => {
  it('treats the platform unrestricted role as the administrator', async () => {
    const access = await service.getAccess('user-admin');
    expect(access.isAdmin).toBe(true);
    expect(access.memberships).toHaveLength(0);
  });

  it('denies a signed-in user with no membership and no unrestricted role', async () => {
    const access = await service.getAccess('user-newcomer');
    expect(access.isAdmin).toBe(false);
    const suppliers = await service.listSuppliers(access, {});
    expect(suppliers).toEqual([]);
    await expect(service.listMembers(access)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('narrows a user that has a scoped membership', async () => {
    const orgMfg = await organizationIdByCode(db.manager, 'ORG-MFG');
    await assign('user-proc', 'procurement', orgMfg);
    const access = await service.getAccess('user-proc');
    expect(access.isAdmin).toBe(false);
    expect(access.memberships).toEqual([
      { organizationId: orgMfg, role: 'procurement', supplierId: null },
    ]);
  });

  it('does not widen access to administrator when the last membership is revoked', async () => {
    const org = await organizationIdByCode(db.manager, 'ORG-MFG');
    await assign('user-revocable', 'procurement', org);
    const before = await service.getAccess('user-revocable');
    expect(before.isAdmin).toBe(false);
    expect(before.memberships).toHaveLength(1);

    const admin = await service.getAccess('user-admin');
    const members = await service.listMembers(admin);
    const membership = members.find(
      (row) => (row as { userId?: string }).userId === 'user-revocable',
    ) as { id: number };
    await service.removeMember(admin, membership.id);

    const after = await service.getAccess('user-revocable');
    expect(after.isAdmin).toBe(false);
    expect(after.memberships).toHaveLength(0);
    await expect(service.listSuppliers(after, {})).resolves.toEqual([]);
  });
});

describe('supplier compliance evaluation', () => {
  it('flags a fully documented supplier as eligible', async () => {
    const access = await service.getAccess('user-admin');
    const suppliers = await service.listSuppliers(access, {});
    const supplier = suppliers.find((row) => row.code === 'SUP-1001')!;
    expect(supplier.status).toBe('qualified');
    expect(supplier.compliance.eligible).toBe(true);
    expect(supplier.compliance.missing).toEqual([]);
    expect(supplier.compliance.expired).toEqual([]);
  });

  it('reports a missing required qualification', async () => {
    const access = await service.getAccess('user-admin');
    const suppliers = await service.listSuppliers(access, {});
    const supplier = suppliers.find((row) => row.code === 'SUP-1002')!;
    expect(supplier.compliance.eligible).toBe(false);
    expect(supplier.compliance.missing).toContain('quality_certification');
  });

  it('reports expired qualifications', async () => {
    const access = await service.getAccess('user-admin');
    const suppliers = await service.listSuppliers(access, {});
    const supplier = suppliers.find((row) => row.code === 'SUP-1003')!;
    expect(supplier.compliance.eligible).toBe(false);
    expect(supplier.compliance.expired).toEqual(
      expect.arrayContaining(['business_license', 'quality_certification']),
    );
  });

  it('reports a qualification expiring inside the warning window', async () => {
    const access = await service.getAccess('user-admin');
    const suppliers = await service.listSuppliers(access, {});
    const supplier = suppliers.find((row) => row.code === 'SUP-1004')!;
    expect(supplier.compliance.eligible).toBe(true);
    expect(supplier.compliance.expiringSoon).toContain('quality_certification');
  });
});

describe('procurement organization isolation', () => {
  it('restricts a procurement specialist to suppliers of their organization', async () => {
    const access = await service.getAccess('user-proc');
    const suppliers = await service.listSuppliers(access, {});
    expect(suppliers.map((row) => row.code).sort()).toEqual([
      'SUP-1001',
      'SUP-1002',
    ]);
  });

  it('denies reading a supplier from another organization', async () => {
    const access = await service.getAccess('user-proc');
    const other = await supplierIdByCode(db.manager, 'SUP-1003');
    await expect(service.getSupplier(access, other)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('denies creating a supplier in another organization', async () => {
    const access = await service.getAccess('user-proc');
    const orgParts = await organizationIdByCode(db.manager, 'ORG-PARTS');
    await expect(
      service.createSupplier(access, {
        organizationId: orgParts,
        name: 'X',
        code: 'SUP-X',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows creating a supplier in the owned organization', async () => {
    const access = await service.getAccess('user-proc');
    const orgMfg = await organizationIdByCode(db.manager, 'ORG-MFG');
    const created = await service.createSupplier(access, {
      organizationId: orgMfg,
      name: '测试供应商',
      code: 'SUP-TEST-1',
    });
    expect(created.status).toBe('draft');
    expect(created.compliance.eligible).toBe(false);
  });
});

describe('qualification review', () => {
  beforeAll(async () => {
    const orgMfg = await organizationIdByCode(db.manager, 'ORG-MFG');
    const orgParts = await organizationIdByCode(db.manager, 'ORG-PARTS');
    await assign('user-quality', 'quality', orgMfg);
    await assign('user-quality', 'quality', orgParts);
  });

  it('only a quality lead may review', async () => {
    const procurement = await service.getAccess('user-proc');
    const supplier = await supplierIdByCode(db.manager, 'SUP-1001');
    await expect(
      service.reviewSupplier(procurement, supplier, { decision: 'approved' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('records a rejection reason', async () => {
    const quality = await service.getAccess('user-quality');
    const supplier = await supplierIdByCode(db.manager, 'SUP-1002');
    const reviewed = await service.reviewSupplier(quality, supplier, {
      decision: 'rejected',
      reason: '缺少质量体系认证证书',
    });
    expect(reviewed.status).toBe('rejected');
    const reviews = await service.listReviews(quality, {
      supplierId: supplier,
    });
    expect(reviews[0]).toMatchObject({
      decision: 'rejected',
      reason: '缺少质量体系认证证书',
    });
  });

  it('requires a reason when rejecting', async () => {
    const quality = await service.getAccess('user-quality');
    const supplier = await supplierIdByCode(db.manager, 'SUP-1004');
    await expect(
      service.reviewSupplier(quality, supplier, { decision: 'rejected' }),
    ).rejects.toMatchObject({ status: 400, code: 'REASON_REQUIRED' });
  });

  it('refuses to qualify a supplier with missing or expired qualifications', async () => {
    const quality = await service.getAccess('user-quality');
    const incomplete = await supplierIdByCode(db.manager, 'SUP-1002');
    await expect(
      service.reviewSupplier(quality, incomplete, { decision: 'approved' }),
    ).rejects.toMatchObject({ status: 400, code: 'INELIGIBLE' });
  });

  it('qualifies an eligible supplier', async () => {
    const quality = await service.getAccess('user-quality');
    const eligible = await supplierIdByCode(db.manager, 'SUP-1004');
    const reviewed = await service.reviewSupplier(quality, eligible, {
      decision: 'approved',
    });
    expect(reviewed.status).toBe('qualified');
    expect(reviewed.compliance.eligible).toBe(true);
  });
});

describe('contracts', () => {
  it('lets legal read but not write contracts', async () => {
    const orgMfg = await organizationIdByCode(db.manager, 'ORG-MFG');
    await assign('user-legal', 'legal', orgMfg);
    const legal = await service.getAccess('user-legal');
    const contracts = await service.listContracts(legal, {});
    expect(contracts.length).toBeGreaterThan(0);
    const supplier = await supplierIdByCode(db.manager, 'SUP-1001');
    await expect(
      service.createContract(legal, {
        supplierId: supplier,
        contractNo: 'HT-X',
        title: 'X',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('supplier contact scope', () => {
  beforeAll(async () => {
    const supplier = await supplierIdByCode(db.manager, 'SUP-1003');
    await assign('user-contact', 'supplier_contact', undefined, supplier);
  });

  it('sees only the authorized supplier', async () => {
    const contact = await service.getAccess('user-contact');
    const suppliers = await service.listSuppliers(contact, {});
    expect(suppliers.map((row) => row.code)).toEqual(['SUP-1003']);
  });

  it('can preview an authorized file and is denied another', async () => {
    const contact = await service.getAccess('user-contact');
    const own = await service.listFiles(contact, {});
    expect(own).toHaveLength(1);
    const ownContent = await service.getFileContent(contact, String(own[0].id));
    expect(ownContent.data.toString('utf8')).toContain('整改');
    await expect(
      service.getFileContent(contact, '11111111-1111-4111-8111-111111111101'),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('file samples', () => {
  it('provides distinct sample assets including a three-page PDF and a DOCX', async () => {
    const access = await service.getAccess('user-admin');
    const files = await service.listFiles(access, {});
    expect(files).toHaveLength(6);
    const pdf = await service.getFileContent(
      access,
      '11111111-1111-4111-8111-111111111102',
    );
    expect(pdf.mimeType).toBe('application/pdf');
    expect(pdf.data.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(
      pdf.data.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length,
    ).toBe(3);
    const docx = files.find((file) => file.ext === 'docx')!;
    expect(docx.filename).toContain('.docx');
    const csv = await service.getFileContent(
      access,
      '11111111-1111-4111-8111-111111111103',
    );
    expect(csv.mimeType).toBe('text/csv');
    expect(csv.data.toString('utf8')).toContain('开户');
  });

  it('keeps a note and removes a deleted file from the list', async () => {
    const access = await service.getAccess('user-admin');
    const updated = await service.updateFile(
      access,
      '11111111-1111-4111-8111-111111111106',
      {
        note: '合同扫描件',
      },
    );
    expect(updated.note).toBe('合同扫描件');
    await service.deleteFile(access, '11111111-1111-4111-8111-111111111106');
    const files = await service.listFiles(access, {});
    expect(
      files.find((file) => file.id === '11111111-1111-4111-8111-111111111106'),
    ).toBeUndefined();
    await expect(
      service.getFileContent(access, '11111111-1111-4111-8111-111111111106'),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('risk reminders', () => {
  it('surfaces expired and expiring items without a dedicated table', async () => {
    const access = await service.getAccess('user-admin');
    const risks = await service.risks(access);
    expect(
      risks.qualifications.some((row) => row.kind === 'qualification_expired'),
    ).toBe(true);
    expect(
      risks.qualifications.some((row) => row.kind === 'qualification_expiring'),
    ).toBe(true);
    expect(risks.contracts.some((row) => row.kind === 'contract_expired')).toBe(
      true,
    );
  });

  it('summarizes the portfolio', async () => {
    const access = await service.getAccess('user-admin');
    const dashboard = await service.dashboard(access);
    expect(dashboard.totals.suppliers).toBeGreaterThanOrEqual(4);
    expect(dashboard.totals.contracts).toBe(3);
    expect(dashboard.risk.expiredQualifications).toBeGreaterThanOrEqual(2);
  });
});

describe('http route security', () => {
  function routesFor(userId?: string) {
    const auth = {
      required() {
        return async (context: any, next: () => Promise<void>) => {
          if (!userId) return context.json({ code: 'UNAUTHORIZED' }, 401);
          context.set('auth', {
            user: { id: userId },
            session: { id: 'test-session' },
          });
          await next();
        };
      },
    };
    return createComplianceRoutes({ auth: auth as never, service });
  }

  it('rejects anonymous requests', async () => {
    const response = await routesFor().request('/suppliers');
    expect(response.status).toBe(401);
  });

  it('rejects an unauthorized role on the content route and allows an authorized one', async () => {
    const contact = routesFor('user-contact');
    const denied = await contact.request(
      '/files/11111111-1111-4111-8111-111111111101/content',
    );
    expect(denied.status).toBe(403);

    const allowed = await contact.request(
      '/files/11111111-1111-4111-8111-111111111105/content',
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('cache-control')).toBe('private, no-store');
    expect(allowed.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(allowed.headers.get('x-content-type-options')).toBe('nosniff');
    expect(allowed.headers.get('content-disposition')).toContain('inline');
  });

  it('serves a non-previewable document as an attachment', async () => {
    const admin = routesFor('user-admin');
    const response = await admin.request(
      '/files/11111111-1111-4111-8111-111111111102/download',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('content-security-policy')).toContain(
      'sandbox',
    );
  });

  it('returns 404 for a missing file', async () => {
    const admin = routesFor('user-admin');
    const response = await admin.request('/files/does-not-exist/content');
    expect(response.status).toBe(404);
  });

  it('neutralizes an uploaded HTML file so it cannot execute in the browser', async () => {
    const access = await service.getAccess('user-admin');
    const supplierId = await supplierIdByCode(db.manager, 'SUP-1001');
    const supplier = await service.getSupplier(access, supplierId);
    const created = await service.createFile(access, {
      filename: 'evil.html',
      mimeType: 'text/html',
      category: 'other',
      organizationId: Number(supplier.organizationId),
      supplierId,
      data: new TextEncoder().encode('<script>alert(1)</script>'),
    });
    const admin = routesFor('user-admin');
    const response = await admin.request(
      `/files/${String(created.id)}/content`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(response.headers.get('content-disposition')).toContain('inline');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain(
      'sandbox',
    );
  });
});

describe('migration reversibility', () => {
  it('drops the compliance tables on down without touching the user table', async () => {
    const second = await createComplianceTestDatabase();
    const query = second.manager.query('main');
    const tables = async () =>
      (
        (await query
          .selectFrom('__nocobase_collection_metadata' as never)
          .selectAll()
          .execute()) as unknown as { name: string }[]
      ).map((row) => row.name);
    const before = await tables();
    expect(before).toContain('suppliers');
    await import('../../database/main/migrations/202609210002_create_compliance_files.js').then(
      (mod) =>
        mod.default.down({
          builder: second.manager.builder('main'),
          query,
          connection: second.manager.connection('main'),
        }),
    );
    await import('../../database/main/migrations/202609210001_create_compliance_core.js').then(
      (mod) =>
        mod.default.down({
          builder: second.manager.builder('main'),
          query,
          connection: second.manager.connection('main'),
        }),
    );
    const after = await tables();
    expect(after).not.toContain('suppliers');
    expect(after).not.toContain('complianceFiles');
    expect(after).toContain('user');
    await second.close();
  });
});
