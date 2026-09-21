import { defineSeed } from '@nocobase/db';

/**
 * Required demonstration data for the supplier compliance application.
 *
 * Idempotent: every record is looked up by its natural key before insert, so re-running the seed never duplicates
 * rows or overwrites edits made through the application. This seed only writes data; it never creates structure.
 */
export default defineSeed({
  name: '202609210001_compliance_reference_data',
  async run({ query }) {
    const now = new Date();

    const organizations = [
      {
        code: 'ORG-MFG',
        name: '制造一部采购中心',
        description: '负责机加工件与电子元件的供应商准入与合同管理。',
      },
      {
        code: 'ORG-PARTS',
        name: '零部件采购部',
        description: '负责原材料与包装材料的供应商准入与合同管理。',
      },
    ];

    for (const organization of organizations) {
      const existing = await query
        .selectFrom('procurementOrganizations')
        .select('id')
        .where('code', '=', organization.code)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('procurementOrganizations')
        .values({ ...organization, createdAt: now, updatedAt: now })
        .execute();
    }

    const orgRows = await query
      .selectFrom('procurementOrganizations')
      .select(['id', 'code'])
      .execute();
    const orgIdByCode = new Map(orgRows.map((row) => [row.code, row.id]));

    const admin = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'nocobase')
      .executeTakeFirst();
    const adminId = admin?.id ?? 'system';

    const suppliers = [
      {
        code: 'SUP-1001',
        org: 'ORG-MFG',
        name: '华东精密机械有限公司',
        category: '机加工件',
        contactName: '张伟',
        contactEmail: 'zhangwei@huadong-precision.example',
        contactPhone: '13800000001',
        status: 'qualified',
        businessScope: '精密机械零部件设计与制造，工业自动化设备配套。',
      },
      {
        code: 'SUP-1002',
        org: 'ORG-MFG',
        name: '南方电子元件有限公司',
        category: '电子元件',
        contactName: '李娜',
        contactEmail: 'lina@nanfang-elec.example',
        contactPhone: '13800000002',
        status: 'pending_review',
        businessScope: '工业级电子元器件、传感器与连接器的供应。',
      },
      {
        code: 'SUP-1003',
        org: 'ORG-PARTS',
        name: '北方材料科技有限公司',
        category: '原材料',
        contactName: '王强',
        contactEmail: 'wangqiang@beifang-mat.example',
        contactPhone: '13800000003',
        status: 'rejected',
        businessScope: '金属原材料与合金材料的批发与供应。',
      },
      {
        code: 'SUP-1004',
        org: 'ORG-PARTS',
        name: '西部包装有限公司',
        category: '包装材料',
        contactName: '赵敏',
        contactEmail: 'zhaomin@xibu-pack.example',
        contactPhone: '13800000004',
        status: 'qualified',
        businessScope: '工业包装材料、纸箱与缓冲材料的生产。',
      },
    ];

    for (const supplier of suppliers) {
      const existing = await query
        .selectFrom('suppliers')
        .select('id')
        .where('code', '=', supplier.code)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('suppliers')
        .values({
          organizationId: orgIdByCode.get(supplier.org)!,
          name: supplier.name,
          code: supplier.code,
          category: supplier.category,
          contactName: supplier.contactName,
          contactEmail: supplier.contactEmail,
          contactPhone: supplier.contactPhone,
          status: supplier.status,
          businessScope: supplier.businessScope,
          createdById: adminId,
          updatedById: adminId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const supplierRows = await query
      .selectFrom('suppliers')
      .select(['id', 'code', 'organizationId'])
      .execute();
    const supplierByCode = new Map(supplierRows.map((row) => [row.code, row]));

    const qualifications = [
      {
        supplier: 'SUP-1001',
        type: 'business_license',
        certificateNo: '91310000MA1FL0001X',
        issuer: '上海市市场监督管理局',
        issuedAt: '2021-05-01',
        expiresAt: '2028-05-01',
        status: 'active',
      },
      {
        supplier: 'SUP-1001',
        type: 'quality_certification',
        certificateNo: 'QC-2026-0001',
        issuer: '中国质量认证中心',
        issuedAt: '2024-06-30',
        expiresAt: '2027-06-30',
        status: 'active',
      },
      {
        supplier: 'SUP-1002',
        type: 'business_license',
        certificateNo: '91440300MA5F0002Y',
        issuer: '深圳市市场监督管理局',
        issuedAt: '2022-01-01',
        expiresAt: '2027-01-01',
        status: 'active',
      },
      {
        supplier: 'SUP-1003',
        type: 'business_license',
        certificateNo: '91110108MA000003Z',
        issuer: '北京市市场监督管理局',
        issuedAt: '2018-01-01',
        expiresAt: '2025-12-31',
        status: 'expired',
      },
      {
        supplier: 'SUP-1003',
        type: 'quality_certification',
        certificateNo: 'QC-2023-0099',
        issuer: '中国质量认证中心',
        issuedAt: '2022-01-16',
        expiresAt: '2026-01-15',
        status: 'expired',
      },
      {
        supplier: 'SUP-1004',
        type: 'business_license',
        certificateNo: '91510100MA000004W',
        issuer: '成都市市场监督管理局',
        issuedAt: '2020-09-30',
        expiresAt: '2027-09-30',
        status: 'active',
      },
      {
        supplier: 'SUP-1004',
        type: 'quality_certification',
        certificateNo: 'QC-2024-0020',
        issuer: '中国质量认证中心',
        issuedAt: '2024-11-15',
        expiresAt: '2026-11-15',
        status: 'active',
      },
    ];

    for (const qualification of qualifications) {
      const supplier = supplierByCode.get(qualification.supplier);
      if (!supplier) continue;
      const existing = await query
        .selectFrom('supplierQualifications')
        .select('id')
        .where('supplierId', '=', supplier.id)
        .where('type', '=', qualification.type)
        .where('certificateNo', '=', qualification.certificateNo)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('supplierQualifications')
        .values({
          supplierId: supplier.id,
          organizationId: supplier.organizationId,
          type: qualification.type,
          certificateNo: qualification.certificateNo,
          issuer: qualification.issuer,
          issuedAt: new Date(qualification.issuedAt),
          expiresAt: new Date(qualification.expiresAt),
          status: qualification.status,
          createdById: adminId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const reviews = [
      {
        supplier: 'SUP-1001',
        reviewYear: 2026,
        decision: 'approved',
        reason: null,
        comments: '营业执照与质量体系认证均在有效期内，年度复审通过。',
      },
      {
        supplier: 'SUP-1003',
        reviewYear: 2026,
        decision: 'rejected',
        reason: '营业执照与质量体系认证均已过期，且未提交有效整改材料。',
        comments: '要求供应商在 2026-10-01 前完成整改并重新提交复审。',
      },
      {
        supplier: 'SUP-1004',
        reviewYear: 2026,
        decision: 'approved',
        reason: null,
        comments: '资质齐全，质量体系认证将于 2026-11-15 到期，请提前续期。',
      },
    ];

    for (const review of reviews) {
      const supplier = supplierByCode.get(review.supplier);
      if (!supplier) continue;
      const existing = await query
        .selectFrom('supplierReviews')
        .select('id')
        .where('supplierId', '=', supplier.id)
        .where('reviewYear', '=', review.reviewYear)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('supplierReviews')
        .values({
          supplierId: supplier.id,
          organizationId: supplier.organizationId,
          reviewerId: adminId,
          reviewYear: review.reviewYear,
          decision: review.decision,
          reason: review.reason,
          comments: review.comments,
          reviewedAt: new Date('2026-03-20'),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const contracts = [
      {
        contractNo: 'HT-2026-001',
        supplier: 'SUP-1001',
        title: '精密机械零部件年度采购框架合同',
        signedAt: '2026-01-10',
        startDate: '2026-01-01',
        endDate: '2027-12-31',
        amount: '1250000.00',
        currency: 'CNY',
        status: 'active',
        legalNotes: '含质量保证条款与违约责任条款，争议提交上海仲裁委员会。',
      },
      {
        contractNo: 'HT-2026-002',
        supplier: 'SUP-1004',
        title: '工业包装材料采购合同',
        signedAt: '2026-02-01',
        startDate: '2026-02-01',
        endDate: '2026-10-15',
        amount: '380000.00',
        currency: 'CNY',
        status: 'active',
        legalNotes: '合同将于 2026-10-15 到期，需评估是否续签。',
      },
      {
        contractNo: 'HT-2025-009',
        supplier: 'SUP-1003',
        title: '金属原材料采购合同',
        signedAt: '2025-01-05',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        amount: '560000.00',
        currency: 'CNY',
        status: 'expired',
        legalNotes: '合同已到期，供应商资质未续期，暂不续签。',
      },
    ];

    for (const contract of contracts) {
      const supplier = supplierByCode.get(contract.supplier);
      if (!supplier) continue;
      const existing = await query
        .selectFrom('contracts')
        .select('id')
        .where('contractNo', '=', contract.contractNo)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('contracts')
        .values({
          organizationId: supplier.organizationId,
          supplierId: supplier.id,
          contractNo: contract.contractNo,
          title: contract.title,
          signedAt: new Date(contract.signedAt),
          startDate: new Date(contract.startDate),
          endDate: new Date(contract.endDate),
          amount: contract.amount,
          currency: contract.currency,
          status: contract.status,
          legalNotes: contract.legalNotes,
          createdById: adminId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
