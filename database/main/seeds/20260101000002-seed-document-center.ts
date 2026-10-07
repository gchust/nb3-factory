import { defineSeed } from '@nocobase/db';

/**
 * Installation data for the Document Center.
 *
 * Seeds write the records the application needs in order to run, and are
 * idempotent: every row is keyed on a stable business value (`departments.code`,
 * `documents.code`) backed by a unique constraint, so a repeated run reuses the
 * existing row. `createdAt` is a fixed instant rather than the current
 * time, so two installations produce identical rows.
 *
 * Document bodies are ordinary text so both the search index and the Q&A
 * paragraph split work without a file attachment: text-only is a deliberate
 * scope decision recorded in `client/AGENTS.md`.
 *
 * The records are typed locally rather than imported from runtime code: a seed
 * is install data, and importing the application's Collection definitions would
 * make what ran depend on a definition that keeps evolving.
 */
const seededAt = new Date('2026-01-01T00:00:00.000Z');

interface DepartmentRecord {
  id: number;
  code: string;
  title: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface DocumentRecord {
  id: number;
  code: string | null;
  title: string;
  category: string;
  summary: string | null;
  content: string;
  status: string;
  visibility: string;
  version: number;
  createdById: string | null;
  updatedById: string | null;
  deletedAt: Date | null;
  deletedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DocumentVersionRecord {
  id: number;
  documentId: number;
  version: number;
  title: string;
  category: string;
  summary: string | null;
  content: string;
  visibility: string;
  departmentIds: number[] | null;
  changeNote: string | null;
  createdById: string | null;
  createdAt: Date;
}

interface DocumentDepartmentRecord {
  id: number;
  documentId: number;
  departmentId: number;
  createdAt: Date;
}

interface DepartmentSeed {
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly sortOrder: number;
}

interface DocumentSeed {
  readonly code: string;
  readonly title: string;
  readonly category: 'handbook' | 'policy' | 'template';
  readonly summary: string;
  readonly content: string;
  readonly visibility: 'all' | 'departments';
  readonly departmentCodes: readonly string[];
}

const departments: readonly DepartmentSeed[] = [
  {
    code: 'general',
    title: '综合行政部',
    description: '公司制度、行政事务与办公保障。',
    sortOrder: 10,
  },
  {
    code: 'finance',
    title: '财务部',
    description: '预算、报销与资金管理。',
    sortOrder: 20,
  },
  {
    code: 'hr',
    title: '人力资源部',
    description: '招聘、薪酬、绩效与员工关系。',
    sortOrder: 30,
  },
  {
    code: 'tech',
    title: '技术部',
    description: '产品研发、运维与信息安全。',
    sortOrder: 40,
  },
  {
    code: 'sales',
    title: '市场部',
    description: '市场推广与客户拓展。',
    sortOrder: 50,
  },
];

const documents: readonly DocumentSeed[] = [
  {
    code: 'employee-handbook',
    title: '员工手册',
    category: 'handbook',
    summary: '公司基本制度、考勤、请假与行为准则，适用于全体员工。',
    visibility: 'all',
    departmentCodes: [],
    content: [
      '# 员工手册',
      '',
      '## 适用范围',
      '',
      '本手册适用于公司全体正式员工、试用期员工与实习生。员工入职时应当阅读并确认知悉本手册内容。',
      '',
      '## 考勤与工时',
      '',
      '标准工作时间为每周一至周五 9:00 至 18:00，午休一小时。员工应当通过考勤系统打卡，迟到或早退当月累计超过三次的，按公司规定处理。',
      '',
      '## 请假制度',
      '',
      '员工请假须提前在系统中提交申请，经直属主管批准后生效。病假需提供医疗机构证明；事假为无薪假；年假按照国家规定与公司福利政策执行。',
      '',
      '## 行为准则',
      '',
      '员工应当遵守职业道德，保守公司商业秘密，不得利用职务便利谋取私利。违反行为准则的，公司有权依据规章制度作出处理。',
    ].join('\n'),
  },
  {
    code: 'travel-reimbursement',
    title: '差旅费报销管理办法',
    category: 'policy',
    summary: '出差申请、费用标准、报销流程与票据要求。',
    visibility: 'all',
    departmentCodes: [],
    content: [
      '# 差旅费报销管理办法',
      '',
      '## 出差申请',
      '',
      '员工出差前应填写出差申请单，注明出差事由、地点、起止日期与预计费用，经直属主管批准后方可出行。未事先批准的行程原则上不予报销。',
      '',
      '## 出差费用标准',
      '',
      '出差期间的交通费按经济合理原则据实报销；住宿费按城市级别执行限额标准，一线城市每人每晚不超过 500 元，其他城市不超过 350 元；伙食补助每人每天 100 元。',
      '',
      '## 报销流程',
      '',
      '出差结束后十个工作日内，员工应在报销系统中提交报销单，附上发票、行程单与出差申请单。报销单经直属主管审批、财务部审核后，费用于次月工资发放日一并支付。',
      '',
      '## 票据要求',
      '',
      '报销凭证应当真实、合法、完整，发票抬头须为公司全称。对不符合规定的票据，财务部有权退回并要求补充说明。',
    ].join('\n'),
  },
  {
    code: 'leave-policy',
    title: '请假与年假制度',
    category: 'policy',
    summary: '各类假期的申请条件、审批权限与年假计算方式。',
    visibility: 'all',
    departmentCodes: [],
    content: [
      '# 请假与年假制度',
      '',
      '## 年假',
      '',
      '员工累计工作满一年不满十年的，年假为十天；满十年不满二十年的，年假为十五天；满二十年的，年假为二十天。年假应在当年内使用，因工作原因未休完的，经批准可结转至次年第一季度。',
      '',
      '## 病假与事假',
      '',
      '病假须提供医疗机构证明，病假期间工资按国家与地方规定执行。事假为无薪假，全年累计事假原则上不超过十五天。',
      '',
      '## 婚假、产假与陪产假',
      '',
      '员工依法享受婚假、产假与陪产假，具体天数依照国家和工作所在地的规定执行。申请时应提供相应证明材料。',
      '',
      '## 审批权限',
      '',
      '三天以内的请假由直属主管批准；三天以上七天以内的，由部门负责人批准；七天以上的，报人力资源部与分管领导批准。',
    ].join('\n'),
  },
  {
    code: 'contract-template',
    title: '标准采购合同模板',
    category: 'template',
    summary: '对外采购使用的标准合同条款，含付款、验收与违约责任。',
    visibility: 'departments',
    departmentCodes: ['finance', 'hr'],
    content: [
      '# 标准采购合同模板',
      '',
      '## 合同主体',
      '',
      '甲方为公司，乙方为供应商。双方应当在合同中载明名称、住所、联系人与联系方式。',
      '',
      '## 付款方式',
      '',
      '合同款项原则上采用银行转账方式支付，预付比例不超过合同总额的百分之三十，验收合格后支付尾款。',
      '',
      '## 交付与验收',
      '',
      '乙方应当按照合同约定的时间、地点与质量标准交付。甲方在收货后十五个工作日内完成验收，验收不合格的有权要求更换或退货。',
      '',
      '## 违约责任',
      '',
      '任何一方违约的，应当赔偿因此给对方造成的实际损失；逾期交付或逾期付款的，按日支付合同总额千分之三的违约金。',
    ].join('\n'),
  },
  {
    code: 'expense-template',
    title: '费用报销单模板',
    category: 'template',
    summary: '日常费用报销使用的标准表单与填写说明。',
    visibility: 'departments',
    departmentCodes: ['finance'],
    content: [
      '# 费用报销单模板',
      '',
      '## 表单字段',
      '',
      '报销人、所属部门、报销日期、费用类型、金额、费用说明、附件张数与审批人。',
      '',
      '## 填写说明',
      '',
      '费用类型应当选择办公费、差旅费、招待费、交通费或其他；费用说明应当写明用途与发生时间；附件须与报销金额一一对应。',
      '',
      '## 提交与审批',
      '',
      '金额在一千元以内的由部门负责人审批；一千元以上的须经财务部复核并报分管领导审批。',
    ].join('\n'),
  },
  {
    code: 'security-policy',
    title: '信息安全管理制度',
    category: 'policy',
    summary: '账号口令、数据分级、终端安全与安全事件报告要求。',
    visibility: 'departments',
    departmentCodes: ['tech'],
    content: [
      '# 信息安全管理制度',
      '',
      '## 账号与口令',
      '',
      '员工应当使用公司统一账号登录系统，口令长度不少于十二位并定期更换，不得与他人共享账号或口令。',
      '',
      '## 数据分级与访问',
      '',
      '公司数据分为公开、内部、秘密与机密四级。秘密及以上数据仅限授权人员访问，导出与对外提供须经数据所有者审批。',
      '',
      '## 终端安全',
      '',
      '办公终端应当安装公司统一的安全软件并及时更新补丁，禁止在办公终端上安装来源不明的软件。',
      '',
      '## 安全事件报告',
      '',
      '发现账号异常、数据泄露或病毒事件的，应当立即断开网络并报告信息安全负责人，不得自行处理或隐瞒。',
    ].join('\n'),
  },
];

/**
 * The second version of the travel policy, to show that an edit appends a
 * version instead of overwriting one.
 */
const travelReimbursementV2 = [
  '# 差旅费报销管理办法',
  '',
  '## 出差申请',
  '',
  '员工出差前应填写出差申请单，注明出差事由、地点、起止日期与预计费用，经直属主管批准后方可出行。未事先批准的行程原则上不予报销。',
  '',
  '## 出差费用标准',
  '',
  '出差期间的交通费按经济合理原则据实报销；住宿费按城市级别执行限额标准，一线城市每人每晚不超过 600 元，其他城市不超过 400 元；伙食补助每人每天 120 元。',
  '',
  '## 报销流程',
  '',
  '出差结束后十个工作日内，员工应在报销系统中提交报销单，附上发票、行程单与出差申请单。报销单经直属主管审批、财务部审核后，费用于次月工资发放日一并支付。',
  '',
  '## 票据要求',
  '',
  '报销凭证应当真实、合法、完整，发票抬头须为公司全称。对不符合规定的票据，财务部有权退回并要求补充说明。',
].join('\n');

export default defineSeed({
  name: '20260101000002-seed-document-center',

  async run(context) {
    const departmentRepo = context.repository<DepartmentRecord>('departments');
    const departmentIds = new Map<string, number>();

    for (const department of departments) {
      let record = await departmentRepo.findOne({
        filter: { code: department.code },
      });
      if (!record) {
        const created = await departmentRepo.createOne({
          values: {
            code: department.code,
            title: department.title,
            description: department.description,
            sortOrder: department.sortOrder,
            active: true,
            createdAt: seededAt,
            updatedAt: seededAt,
          },
        });
        record = created.record;
      }
      departmentIds.set(department.code, record.id);
    }

    const documentRepo = context.repository<DocumentRecord>('documents');
    const versionRepo =
      context.repository<DocumentVersionRecord>('documentVersions');
    const linkRepo = context.repository<DocumentDepartmentRecord>(
      'documentDepartments',
    );

    for (const document of documents) {
      const isTravelPolicy = document.code === 'travel-reimbursement';
      const currentContent = isTravelPolicy
        ? travelReimbursementV2
        : document.content;
      const currentVersion = isTravelPolicy ? 2 : 1;
      const visibleDepartmentIds =
        document.visibility === 'all'
          ? []
          : document.departmentCodes.map((code) => {
              const id = departmentIds.get(code);
              if (id === undefined) {
                throw new Error(
                  `Seed references an unknown department: ${code}`,
                );
              }
              return id;
            });

      // A repeat run must not overwrite an administrator's edits, so an
      // existing row is reused untouched and only a missing one is created.
      let savedDocument = await documentRepo.findOne({
        filter: { code: document.code },
      });
      if (!savedDocument) {
        const created = await documentRepo.createOne({
          values: {
            code: document.code,
            title: document.title,
            category: document.category,
            summary: document.summary,
            content: currentContent,
            status: 'published',
            visibility: document.visibility,
            version: currentVersion,
            createdAt: seededAt,
            updatedAt: seededAt,
          },
        });
        savedDocument = created.record;
      }

      // Version 1 always exists and is the original body; the travel policy has
      // a second version carrying its current body.
      const firstVersion = await versionRepo.findOne({
        filter: { documentId: savedDocument.id, version: 1 },
      });
      if (!firstVersion) {
        await versionRepo.createOne({
          values: {
            documentId: savedDocument.id,
            version: 1,
            title: document.title,
            category: document.category,
            summary: document.summary,
            content: document.content,
            visibility: document.visibility,
            departmentIds: visibleDepartmentIds,
            changeNote: '初始版本',
            createdAt: seededAt,
          },
        });
      }

      if (isTravelPolicy) {
        const secondVersion = await versionRepo.findOne({
          filter: { documentId: savedDocument.id, version: 2 },
        });
        if (!secondVersion) {
          await versionRepo.createOne({
            values: {
              documentId: savedDocument.id,
              version: 2,
              title: document.title,
              category: document.category,
              summary: document.summary,
              content: travelReimbursementV2,
              visibility: document.visibility,
              departmentIds: visibleDepartmentIds,
              changeNote: '上调住宿费与伙食补助标准',
              createdAt: seededAt,
            },
          });
        }
      }

      for (const departmentId of visibleDepartmentIds) {
        const link = await linkRepo.findOne({
          filter: { documentId: savedDocument.id, departmentId },
        });
        if (!link) {
          await linkRepo.createOne({
            values: {
              documentId: savedDocument.id,
              departmentId,
              createdAt: seededAt,
            },
          });
        }
      }
    }
  },
});

/** Re-exported so a test can assert the seeded shape without duplicating it. */
export { documents as seededDocuments, departments as seededDepartments };
