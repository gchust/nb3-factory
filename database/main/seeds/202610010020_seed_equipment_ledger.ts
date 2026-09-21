import { defineSeed } from '@nocobase/db';

/**
 * The equipment ledger plus calibration history. Calibration expiry is what the
 * reservation rule reads, so the fixtures deliberately cover all three states:
 * current, expiring within thirty days, and already expired.
 */

const CREATED_AT = new Date('2026-01-08T08:00:00.000Z');

interface CalibrationSeed {
  calibratedAt: string;
  expiresAt: string;
  provider: string;
  certificateNo: string;
  result: 'passed' | 'failed';
  notes: string;
}

interface EquipmentSeed {
  assetNo: string;
  name: string;
  model: string;
  serialNo: string;
  category: string;
  labCode: string;
  status: string;
  purchaseDate: string;
  ownerName: string;
  description: string;
  studentVisible: boolean;
  studentDescription: string;
  calibration: CalibrationSeed;
}

const EQUIPMENT: EquipmentSeed[] = [
  {
    assetNo: 'EQ-2026-001',
    name: '电子天平',
    model: 'BSA224S',
    serialNo: 'SN-BSA-220001',
    category: 'weighing',
    labCode: 'LAB-A',
    status: 'available',
    purchaseDate: '2023-04-18',
    ownerName: '王敏',
    description: '最大量程 220 g，可读性 0.1 mg，用于标准样品与试剂称量。',
    studentVisible: true,
    studentDescription:
      '高精度电子天平，用于称量少量粉末与标准样品，使用前需预热 30 分钟。',
    calibration: {
      calibratedAt: '2026-06-20',
      expiresAt: '2027-06-30',
      provider: '市计量检定测试院',
      certificateNo: 'CAL-2026-0630-001',
      result: 'passed',
      notes: '四角偏差与重复性均符合 JJG 1036 要求。',
    },
  },
  {
    assetNo: 'EQ-2026-002',
    name: '数字万用表',
    model: 'Fluke 87V',
    serialNo: 'SN-FLUKE-880012',
    category: 'electrical',
    labCode: 'LAB-A',
    status: 'available',
    purchaseDate: '2022-09-02',
    ownerName: '陈刚',
    description: '真有效值数字万用表，用于电路测量与传感器输出校验。',
    studentVisible: true,
    studentDescription:
      '数字万用表，可测量电压、电流与电阻，接线前必须确认量程。',
    calibration: {
      calibratedAt: '2025-05-25',
      expiresAt: '2026-05-31',
      provider: '市计量检定测试院',
      certificateNo: 'CAL-2025-0531-014',
      result: 'passed',
      notes: '证书已过期，需复校后方可用于量值传递实验。',
    },
  },
  {
    assetNo: 'EQ-2026-003',
    name: '高速离心机',
    model: 'Eppendorf 5424',
    serialNo: 'SN-EPP-5424-033',
    category: 'separation',
    labCode: 'LAB-A',
    status: 'maintenance',
    purchaseDate: '2021-11-11',
    ownerName: '陈刚',
    description: '最高转速 21130 rpm，用于微量样品离心分离。',
    studentVisible: false,
    studentDescription: '',
    calibration: {
      calibratedAt: '2025-10-12',
      expiresAt: '2026-10-10',
      provider: '省计量科学研究院',
      certificateNo: 'CAL-2025-1010-033',
      result: 'passed',
      notes: '转速示值误差在允许范围内，下次到期前需完成复校。',
    },
  },
  {
    assetNo: 'EQ-2026-004',
    name: '紫外可见分光光度计',
    model: 'UV-2600',
    serialNo: 'SN-UV-2600-007',
    category: 'optical',
    labCode: 'LAB-A',
    status: 'available',
    purchaseDate: '2024-03-06',
    ownerName: '孙芳',
    description: '波长范围 190–1100 nm，用于溶液浓度与吸光度测量。',
    studentVisible: true,
    studentDescription:
      '紫外可见分光光度计，用于测定溶液吸光度，样品池必须配对使用。',
    calibration: {
      calibratedAt: '2026-03-16',
      expiresAt: '2027-03-15',
      provider: '省计量科学研究院',
      certificateNo: 'CAL-2026-0315-007',
      result: 'passed',
      notes: '波长准确度与基线平直度合格。',
    },
  },
  {
    assetNo: 'EQ-2026-005',
    name: '恒温干燥箱',
    model: 'DHG-9070A',
    serialNo: 'SN-DHG-9070-021',
    category: 'thermal',
    labCode: 'LAB-A',
    status: 'retired',
    purchaseDate: '2016-07-19',
    ownerName: '王敏',
    description: '温控范围 室温–250 ℃，已停用待报废。',
    studentVisible: false,
    studentDescription: '',
    calibration: {
      calibratedAt: '2025-04-02',
      expiresAt: '2026-04-01',
      provider: '市计量检定测试院',
      certificateNo: 'CAL-2025-0401-021',
      result: 'failed',
      notes: '温度均匀度超差，已停止使用并进入报废流程。',
    },
  },
  {
    assetNo: 'EQ-2026-101',
    name: '台式酸度计',
    model: 'PHS-3E',
    serialNo: 'SN-PHS-3E-118',
    category: 'analysis',
    labCode: 'LAB-B',
    status: 'available',
    purchaseDate: '2024-06-24',
    ownerName: '李娜',
    description: '用于溶液 pH 值测量，配复合电极。',
    studentVisible: true,
    studentDescription:
      '台式酸度计，用于测量溶液酸碱度，电极使用后需浸泡保存。',
    calibration: {
      calibratedAt: '2026-01-21',
      expiresAt: '2027-01-20',
      provider: '省计量科学研究院',
      certificateNo: 'CAL-2026-0120-118',
      result: 'passed',
      notes: '示值误差与重复性合格。',
    },
  },
];

interface ReservationSeed {
  assetNo: string;
  username: string;
  startsAt: string;
  endsAt: string;
  purpose: string;
  status: string;
}

const RESERVATIONS: ReservationSeed[] = [
  {
    assetNo: 'EQ-2026-001',
    username: 'student1',
    startsAt: '2026-10-06T01:00:00.000Z',
    endsAt: '2026-10-06T03:00:00.000Z',
    purpose: '本科毕业设计样品称量。',
    status: 'reserved',
  },
  {
    assetNo: 'EQ-2026-004',
    username: 'teacher1',
    startsAt: '2026-10-07T06:00:00.000Z',
    endsAt: '2026-10-07T08:00:00.000Z',
    purpose: '仪器分析实验课程预实验。',
    status: 'reserved',
  },
];

const seed = defineSeed({
  name: '202610010020_seed_equipment_ledger',
  async run({ query }) {
    const labCodes = ['LAB-A', 'LAB-B'];
    const labIds = new Map<string, number>();
    for (const code of labCodes) {
      const lab = await query
        .selectFrom('laboratories')
        .select('id')
        .where('code', '=', code)
        .executeTakeFirstOrThrow();
      labIds.set(code, Number(lab.id));
    }

    const equipmentIds = new Map<string, number>();

    for (const item of EQUIPMENT) {
      const labId = labIds.get(item.labCode);
      if (labId === undefined) {
        throw new Error(`Seed references unknown laboratory ${item.labCode}`);
      }

      const existing = await query
        .selectFrom('equipment')
        .select('id')
        .where('assetNo', '=', item.assetNo)
        .executeTakeFirst();

      if (!existing) {
        await query
          .insertInto('equipment')
          .values({
            assetNo: item.assetNo,
            name: item.name,
            model: item.model,
            serialNo: item.serialNo,
            category: item.category,
            labId,
            status: item.status,
            purchaseDate: new Date(`${item.purchaseDate}T00:00:00.000Z`),
            ownerName: item.ownerName,
            description: item.description,
            studentVisible: item.studentVisible,
            studentDescription: item.studentDescription,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
          })
          .execute();
      }

      const row = await query
        .selectFrom('equipment')
        .select('id')
        .where('assetNo', '=', item.assetNo)
        .executeTakeFirstOrThrow();
      const equipmentId = Number(row.id);
      equipmentIds.set(item.assetNo, equipmentId);

      const existingCalibration = await query
        .selectFrom('calibration_records')
        .select('id')
        .where('equipmentId', '=', equipmentId)
        .where('certificateNo', '=', item.calibration.certificateNo)
        .executeTakeFirst();
      if (!existingCalibration) {
        await query
          .insertInto('calibration_records')
          .values({
            equipmentId,
            calibratedAt: new Date(
              `${item.calibration.calibratedAt}T00:00:00.000Z`,
            ),
            expiresAt: new Date(`${item.calibration.expiresAt}T00:00:00.000Z`),
            provider: item.calibration.provider,
            certificateNo: item.calibration.certificateNo,
            result: item.calibration.result,
            notes: item.calibration.notes,
            createdById: `demo-${item.labCode === 'LAB-B' ? 'lab2admin' : 'labadmin'}`,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
          })
          .execute();
      }
    }

    for (const reservation of RESERVATIONS) {
      const equipmentId = equipmentIds.get(reservation.assetNo);
      if (equipmentId === undefined) {
        continue;
      }
      const existing = await query
        .selectFrom('equipment_reservations')
        .select('id')
        .where('equipmentId', '=', equipmentId)
        .where('userId', '=', `demo-${reservation.username}`)
        .where('startsAt', '=', new Date(reservation.startsAt))
        .executeTakeFirst();
      if (!existing) {
        await query
          .insertInto('equipment_reservations')
          .values({
            equipmentId,
            userId: `demo-${reservation.username}`,
            startsAt: new Date(reservation.startsAt),
            endsAt: new Date(reservation.endsAt),
            purpose: reservation.purpose,
            status: reservation.status,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
          })
          .execute();
      }
    }
  },
});

export default seed;
