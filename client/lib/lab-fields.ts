/**
 * The forms the business pages open, described once.
 *
 * Each page renders these through `FormDialog`; keeping the descriptions here rather than in a
 * component file means a page module exports only its page, and a field added to a record is added
 * in one place instead of the one page that happened to be edited first.
 */
import type { FormFieldSpec } from './lab-form.js';
import { optionLabels, type Translate } from './lab-options.js';
import {
  CALIBRATION_RESULT_OPTIONS,
  EQUIPMENT_STATUS_OPTIONS,
  LAB_STATUS_OPTIONS,
  SAFETY_RESULT_OPTIONS,
  SAFETY_SEVERITY_OPTIONS,
  WORK_ORDER_PRIORITY_OPTIONS,
  WORK_ORDER_TYPE_OPTIONS,
  type LaboratoryView,
} from './lab-types.js';

export interface Choice {
  readonly value: string;
  readonly label: string;
}

export function laboratoryChoices(
  laboratories: readonly LaboratoryView[],
): Choice[] {
  return laboratories.map((laboratory) => ({
    value: String(laboratory.id),
    label: `${laboratory.code} · ${laboratory.name}`,
  }));
}

export function equipmentChoices(
  equipment: readonly { id: number; assetNo: string; name: string }[],
): Choice[] {
  return equipment.map((item) => ({
    value: String(item.id),
    label: `${item.assetNo} · ${item.name}`,
  }));
}

/** `code` is set once, when the laboratory is created. */
export function laboratoryFields(
  t: Translate,
  includeCode: boolean,
): FormFieldSpec[] {
  const fields: FormFieldSpec[] = [];
  if (includeCode) {
    fields.push({
      name: 'code',
      labelKey: 'lab.code',
      kind: 'text',
      required: true,
    });
  }
  fields.push(
    { name: 'name', labelKey: 'lab.name', kind: 'text', required: true },
    { name: 'building', labelKey: 'lab.building', kind: 'text' },
    { name: 'room', labelKey: 'lab.room', kind: 'text' },
    {
      name: 'status',
      labelKey: 'lab.status',
      kind: 'select',
      required: true,
      options: optionLabels(LAB_STATUS_OPTIONS, t),
    },
    {
      name: 'description',
      labelKey: 'lab.description',
      kind: 'textarea',
      full: true,
    },
  );
  return fields;
}

/** The home laboratory is chosen when the instrument enters the ledger, not on every edit. */
export function equipmentFields(
  t: Translate,
  laboratoryOptions: readonly Choice[],
  includeLaboratory: boolean,
): FormFieldSpec[] {
  const fields: FormFieldSpec[] = [];
  if (includeLaboratory) {
    fields.push({
      name: 'labId',
      labelKey: 'lab.laboratory',
      kind: 'select',
      required: true,
      options: laboratoryOptions,
    });
  }
  fields.push(
    { name: 'assetNo', labelKey: 'lab.assetNo', kind: 'text', required: true },
    { name: 'name', labelKey: 'lab.name', kind: 'text', required: true },
    { name: 'category', labelKey: 'lab.category', kind: 'text' },
    {
      name: 'status',
      labelKey: 'lab.status',
      kind: 'select',
      required: true,
      options: optionLabels(EQUIPMENT_STATUS_OPTIONS, t),
    },
    { name: 'model', labelKey: 'lab.model', kind: 'text' },
    { name: 'serialNo', labelKey: 'lab.serialNo', kind: 'text' },
    { name: 'ownerName', labelKey: 'lab.ownerName', kind: 'text' },
    { name: 'purchaseDate', labelKey: 'lab.purchaseDate', kind: 'date' },
    {
      name: 'description',
      labelKey: 'lab.description',
      kind: 'textarea',
      full: true,
    },
    {
      name: 'studentVisible',
      labelKey: 'lab.studentVisible',
      kind: 'checkbox',
    },
    {
      name: 'studentDescription',
      labelKey: 'lab.studentDescription',
      kind: 'textarea',
      full: true,
    },
  );
  return fields;
}

export function calibrationFields(
  t: Translate,
  includeEquipment: boolean,
  equipmentOptions: readonly Choice[],
): FormFieldSpec[] {
  const fields: FormFieldSpec[] = [];
  if (includeEquipment) {
    fields.push({
      name: 'equipmentId',
      labelKey: 'lab.equipment',
      kind: 'select',
      required: true,
      options: equipmentOptions,
    });
  }
  fields.push(
    {
      name: 'calibratedAt',
      labelKey: 'lab.calibratedAt',
      kind: 'datetime',
      required: true,
    },
    {
      name: 'expiresAt',
      labelKey: 'lab.expiresAt',
      kind: 'datetime',
      required: true,
    },
    {
      name: 'result',
      labelKey: 'lab.result',
      kind: 'select',
      required: true,
      options: optionLabels(CALIBRATION_RESULT_OPTIONS, t),
    },
    { name: 'provider', labelKey: 'lab.provider', kind: 'text' },
    { name: 'certificateNo', labelKey: 'lab.certificateNo', kind: 'text' },
    { name: 'notes', labelKey: 'lab.notes', kind: 'textarea', full: true },
  );
  return fields;
}

export function workOrderFields(
  t: Translate,
  equipmentOptions: readonly Choice[],
): FormFieldSpec[] {
  return [
    {
      name: 'equipmentId',
      labelKey: 'lab.equipment',
      kind: 'select',
      required: true,
      options: equipmentOptions,
    },
    { name: 'title', labelKey: 'lab.title', kind: 'text', required: true },
    {
      name: 'type',
      labelKey: 'lab.workOrderType',
      kind: 'select',
      required: true,
      options: optionLabels(WORK_ORDER_TYPE_OPTIONS, t),
    },
    {
      name: 'priority',
      labelKey: 'lab.priority',
      kind: 'select',
      required: true,
      options: optionLabels(WORK_ORDER_PRIORITY_OPTIONS, t),
    },
    {
      name: 'description',
      labelKey: 'lab.faultDescription',
      kind: 'textarea',
      full: true,
    },
  ];
}

export function safetyCheckFields(
  t: Translate,
  laboratoryOptions: readonly Choice[],
  includeLaboratory: boolean,
): FormFieldSpec[] {
  const fields: FormFieldSpec[] = [];
  if (includeLaboratory) {
    fields.push({
      name: 'labId',
      labelKey: 'lab.laboratory',
      kind: 'select',
      required: true,
      options: laboratoryOptions,
    });
  }
  fields.push(
    { name: 'title', labelKey: 'lab.title', kind: 'text', required: true },
    { name: 'checkType', labelKey: 'lab.checkType', kind: 'text' },
    {
      name: 'result',
      labelKey: 'lab.result',
      kind: 'select',
      required: true,
      options: optionLabels(SAFETY_RESULT_OPTIONS, t),
    },
    {
      name: 'severity',
      labelKey: 'lab.severity',
      kind: 'select',
      options: optionLabels(SAFETY_SEVERITY_OPTIONS, t),
      helpKey: 'lab.severityHint',
    },
    { name: 'checkedAt', labelKey: 'lab.checkedAt', kind: 'datetime' },
    {
      name: 'findings',
      labelKey: 'lab.findings',
      kind: 'textarea',
      required: true,
      full: true,
    },
  );
  return fields;
}

export function trainingFields(include: {
  readonly laboratory?: readonly Choice[];
  readonly equipment?: readonly Choice[];
}): FormFieldSpec[] {
  const fields: FormFieldSpec[] = [];
  if (include.laboratory) {
    fields.push({
      name: 'labId',
      labelKey: 'lab.laboratory',
      kind: 'select',
      required: true,
      options: include.laboratory,
    });
  }
  fields.push(
    { name: 'title', labelKey: 'lab.title', kind: 'text', required: true },
    { name: 'trainer', labelKey: 'lab.trainer', kind: 'text' },
    { name: 'trainedAt', labelKey: 'lab.trainedAt', kind: 'datetime' },
    {
      name: 'participantCount',
      labelKey: 'lab.participantCount',
      kind: 'number',
    },
  );
  if (include.equipment) {
    fields.push({
      name: 'equipmentId',
      labelKey: 'lab.equipment',
      kind: 'select',
      options: include.equipment,
      helpKey: 'lab.trainingEquipmentHint',
    });
  }
  fields.push({
    name: 'notes',
    labelKey: 'lab.notes',
    kind: 'textarea',
    full: true,
  });
  return fields;
}
