/**
 * The client-side vocabulary the pages are built from.
 *
 * These are pure functions, so they can be checked directly. They matter because the record values the
 * server stores are snake_case (`in_use`) while the labels in `lab-types.ts` are keyed camelCase
 * (`lab.equipmentStatus.inUse`): getting that mapping wrong shows a raw value in a table instead of a
 * translated one, and it fails silently. Every label key is read from the real locale file, so a key
 * that was never written also fails here.
 */
import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.ts';
import { formatDay, formatMoment } from '../../client/lib/lab-format.ts';
import {
  toFileRecord,
  formatSize,
  purposeKey,
} from '../../client/lib/lab-file.ts';
import {
  missingRequiredFields,
  toFormValues,
  toPayload,
  type FormFieldSpec,
} from '../../client/lib/lab-form.ts';
import {
  labelFor,
  optionLabels,
  ROLE_LABEL_KEYS,
} from '../../client/lib/lab-options.ts';
import {
  availableWorkOrderActions,
  canWriteIn,
  hasStaffRole,
  staffRoleIn,
  transitionTarget,
} from '../../client/lib/lab-permissions.ts';
import { calibrationTone, statusTone } from '../../client/lib/lab-status.ts';
import {
  CALIBRATION_RESULT_OPTIONS,
  EQUIPMENT_STATUS_OPTIONS,
  FILE_PURPOSE_OPTIONS,
  LAB_ROLE_OPTIONS,
  LAB_STATUS_OPTIONS,
  RESERVATION_STATUS_OPTIONS,
  SAFETY_RESULT_OPTIONS,
  SAFETY_SEVERITY_OPTIONS,
  SAFETY_STATUS_OPTIONS,
  WORK_ORDER_PRIORITY_OPTIONS,
  WORK_ORDER_STATUS_OPTIONS,
  WORK_ORDER_TYPE_OPTIONS,
  type LabAccess,
  type LabOption,
} from '../../client/lib/lab-types.ts';

const messages = enUS as unknown as Record<string, string>;
const t = (key: string): string => messages[key] ?? key;

const EVERY_OPTION_LIST: readonly [string, readonly LabOption[]][] = [
  ['LAB_STATUS_OPTIONS', LAB_STATUS_OPTIONS],
  ['LAB_ROLE_OPTIONS', LAB_ROLE_OPTIONS],
  ['EQUIPMENT_STATUS_OPTIONS', EQUIPMENT_STATUS_OPTIONS],
  ['CALIBRATION_RESULT_OPTIONS', CALIBRATION_RESULT_OPTIONS],
  ['WORK_ORDER_TYPE_OPTIONS', WORK_ORDER_TYPE_OPTIONS],
  ['WORK_ORDER_PRIORITY_OPTIONS', WORK_ORDER_PRIORITY_OPTIONS],
  ['WORK_ORDER_STATUS_OPTIONS', WORK_ORDER_STATUS_OPTIONS],
  ['RESERVATION_STATUS_OPTIONS', RESERVATION_STATUS_OPTIONS],
  ['SAFETY_RESULT_OPTIONS', SAFETY_RESULT_OPTIONS],
  ['SAFETY_SEVERITY_OPTIONS', SAFETY_SEVERITY_OPTIONS],
  ['SAFETY_STATUS_OPTIONS', SAFETY_STATUS_OPTIONS],
  ['FILE_PURPOSE_OPTIONS', FILE_PURPOSE_OPTIONS],
];

describe('laboratory client helpers', () => {
  describe('option labels', () => {
    it('labels every option and every role in both languages', () => {
      for (const [name, options] of EVERY_OPTION_LIST) {
        expect(options.length > 0).toBe(true);
        for (const option of options) {
          // The translator returns the key itself when the message is missing, which is what would be shown.
          const label = t(option.labelKey);
          expect(`${name}:${option.value}=${label}`).not.toBe(
            `${name}:${option.value}=${option.labelKey}`,
          );
        }
      }
      for (const [role, key] of Object.entries(ROLE_LABEL_KEYS)) {
        expect(`${role}=${t(key)}`).not.toBe(`${role}=${key}`);
      }
    });

    it('translates a stored snake_case value through the camelCase label key', () => {
      expect(labelFor(EQUIPMENT_STATUS_OPTIONS, 'in_use', t)).toBe('In use');
      expect(labelFor(WORK_ORDER_STATUS_OPTIONS, 'pending_review', t)).toBe(
        'Pending review',
      );
      expect(labelFor(WORK_ORDER_TYPE_OPTIONS, 'calibration', t)).toBe(
        'Calibration',
      );
      expect(labelFor(SAFETY_SEVERITY_OPTIONS, 'critical', t)).toBe('Critical');
    });

    it('passes an unknown or empty value through untouched', () => {
      expect(labelFor(EQUIPMENT_STATUS_OPTIONS, 'invented', t)).toBe(
        'invented',
      );
      expect(labelFor(EQUIPMENT_STATUS_OPTIONS, '', t)).toBe('');
      expect(labelFor(EQUIPMENT_STATUS_OPTIONS, null, t)).toBe('');
      expect(labelFor(EQUIPMENT_STATUS_OPTIONS, undefined, t)).toBe('');
    });

    it('builds the choices a select renders', () => {
      expect(optionLabels(SAFETY_RESULT_OPTIONS, t)).toEqual([
        { value: 'pending', label: 'Pending' },
        { value: 'pass', label: 'Pass' },
        { value: 'issue', label: 'Issue' },
      ]);
    });

    it('maps an attachment purpose onto its label key', () => {
      expect(purposeKey('before_repair')).toBe('beforeRepair');
      expect(t(`lab.filePurpose.${purposeKey('before_repair')}`)).toBe(
        'Before repair',
      );
      expect(t(`lab.filePurpose.${purposeKey('roster')}`)).toBe(
        'Training roster',
      );
      expect(labelFor(FILE_PURPOSE_OPTIONS, 'risk_notice', t)).toBe(
        'Risk notice',
      );
    });
  });

  describe('tones and formats', () => {
    it('paints a state the same way wherever it is shown', () => {
      expect(statusTone('in_use')).toBe('secondary');
      expect(statusTone('maintenance')).toBe('destructive');
      expect(statusTone('completed')).toBe('outline');
      expect(statusTone('pending_review')).toBe('default');
      // An unknown or absent value still has to render as something.
      expect(statusTone('invented')).toBe('secondary');
      expect(statusTone(null)).toBe('outline');
    });

    it('paints calibration from the comparison the server made', () => {
      expect(calibrationTone(true, false)).toBe('destructive');
      expect(calibrationTone(false, true)).toBe('secondary');
      expect(calibrationTone(false, false)).toBe('default');
    });

    it('shows an unset date as a word rather than an invalid one', () => {
      expect(formatMoment(t, null)).toBe('Not set');
      expect(formatMoment(t, '')).toBe('Not set');
      expect(formatDay(t, 'not a date')).toBe('Not set');
      expect(formatDay(t, '2026-09-21T08:00:00.000Z')).toBe(
        new Date('2026-09-21T08:00:00.000Z').toLocaleDateString(),
      );
    });

    it('describes a size in units a person compares at a glance', () => {
      expect(formatSize(0)).toBe('0 KB');
      expect(formatSize(512)).toBe('512 B');
      expect(formatSize(2048)).toBe('2.0 KB');
      expect(formatSize(1_300_000)).toBe('1.2 MB');
    });
  });

  describe('form values', () => {
    const fields: readonly FormFieldSpec[] = [
      { name: 'title', labelKey: 'lab.title', kind: 'text', required: true },
      { name: 'notes', labelKey: 'lab.notes', kind: 'textarea' },
      {
        name: 'labId',
        labelKey: 'lab.laboratory',
        kind: 'select',
        required: true,
      },
      {
        name: 'trainedAt',
        labelKey: 'lab.trainedAt',
        kind: 'datetime',
        required: true,
      },
      { name: 'checkedOn', labelKey: 'lab.checkedAt', kind: 'date' },
      { name: 'count', labelKey: 'lab.participantCount', kind: 'number' },
      {
        name: 'studentVisible',
        labelKey: 'lab.studentVisible',
        kind: 'checkbox',
      },
    ];

    it('reads a record into the text a form input holds', () => {
      const values = toFormValues(fields, {
        title: 'Annual safety training',
        notes: null,
        labId: 3,
        trainedAt: '2026-09-21T08:00:00.000Z',
        checkedOn: '2026-09-20T00:00:00.000Z',
        count: 12,
        studentVisible: true,
      });
      expect(values.title).toBe('Annual safety training');
      expect(values.notes).toBe('');
      expect(values.labId).toBe('3');
      expect(values.count).toBe('12');
      expect(values.studentVisible).toBe(true);
      // A datetime is localised for the input, so the exact text depends on the viewer's zone.
      expect(values.trainedAt).toMatch(/^2026-09-2\dT\d\d:\d\d$/);
    });

    it('sends a temporal field as an instant and an emptied choice as null', () => {
      const payload = toPayload(fields, {
        title: '  Annual safety training  ',
        notes: '',
        labId: '',
        trainedAt: '2026-09-21T08:30',
        checkedOn: '',
        count: '',
        studentVisible: false,
      });
      expect(payload.title).toBe('Annual safety training');
      expect(payload.notes).toBe('');
      expect(payload.labId).toBeNull();
      expect(payload.checkedOn).toBeNull();
      expect(payload.trainedAt).toBe(
        new Date('2026-09-21T08:30').toISOString(),
      );
      // An emptied number is left out, so the stored value keeps its column default.
      expect(payload).not.toHaveProperty('count');
      expect(payload.studentVisible).toBe(false);
    });

    it('names the fields the user still has to fill in, in the order they are declared', () => {
      expect(
        missingRequiredFields(fields, {
          title: '   ',
          notes: 'x',
          labId: '3',
          trainedAt: '',
          checkedOn: '',
          count: '',
          studentVisible: false,
        }).map((field) => field.name),
      ).toEqual(['title', 'trainedAt']);
    });
  });

  describe('attachment records', () => {
    it('describes a stored attachment as a file record the previewers accept', () => {
      const record = toFileRecord({
        id: '7',
        filename: 'manual.pdf',
        ext: 'pdf',
        mimeType: 'application/pdf',
        size: 1024,
        purpose: 'manual',
        targetType: 'equipment',
        targetId: '1',
        remark: null,
        uploadedById: 'user-1',
        uploadedByName: 'Dr. Lin',
        createdAt: '2026-09-21T08:00:00.000Z',
        contentUrl: '/main/lab-files/7/content',
      });
      expect(record).toMatchObject({
        id: '7',
        filename: 'manual.pdf',
        ext: 'pdf',
        mimeType: 'application/pdf',
        size: 1024,
        contentUrl: '/main/lab-files/7/content',
      });
      // The helpers treat disk and key as identity, and the record is uploaded once.
      expect(record.disk).toBe('database');
      expect(record.key).toBe('7');
      expect(record.updatedAt).toBe(record.createdAt);
    });
  });

  describe('affordances', () => {
    const access: LabAccess = {
      userId: 'user-1',
      isRoot: false,
      memberships: [
        { labId: 1, role: 'lab_admin' },
        { labId: 2, role: 'technician' },
        { labId: 3, role: 'student' },
      ],
    };

    it('reads the role from the membership rather than from a flag', () => {
      expect(staffRoleIn(access, 1)).toBe('lab_admin');
      expect(staffRoleIn(access, 2)).toBe('technician');
      expect(staffRoleIn(access, 3)).toBeNull();
      expect(staffRoleIn(access, 4)).toBeNull();
      expect(staffRoleIn(undefined, 1)).toBeNull();
    });

    it('offers a write only inside the role the server accepts for it', () => {
      expect(canWriteIn(access, 1, ['lab_admin'])).toBe(true);
      expect(canWriteIn(access, 2, ['lab_admin'])).toBe(false);
      expect(canWriteIn(access, 2, ['technician'])).toBe(true);
      expect(canWriteIn(access, 3, ['technician'])).toBe(false);
      expect(hasStaffRole(access, ['safety_officer'])).toBe(false);
      expect(hasStaffRole(access, ['technician'])).toBe(true);
      expect(hasStaffRole(undefined, ['technician'])).toBe(false);
    });

    it('lets a root user do anything', () => {
      const root: LabAccess = { userId: 'root', isRoot: true, memberships: [] };
      expect(canWriteIn(root, 9, ['lab_admin'])).toBe(true);
      expect(staffRoleIn(root, 9)).toBeNull();
      expect(hasStaffRole(root, ['safety_officer'])).toBe(true);
    });

    it('mirrors the transitions the service allows from each status', () => {
      expect(transitionTarget('assign', 'open')).toBe('assigned');
      expect(transitionTarget('assign', 'in_progress')).toBeNull();
      expect(transitionTarget('start', 'assigned')).toBe('in_progress');
      expect(transitionTarget('submit_review', 'in_progress')).toBe(
        'pending_review',
      );
      expect(transitionTarget('complete', 'pending_review')).toBe('completed');
      expect(transitionTarget('reject', 'pending_review')).toBe('in_progress');
      expect(transitionTarget('cancel', 'completed')).toBeNull();
      expect(transitionTarget('unknown', 'open')).toBeNull();
    });

    it('offers only the transitions this viewer may make from this status', () => {
      // A technician can move the work along but cannot assign or complete it.
      expect(availableWorkOrderActions(access, 2, 'assigned')).toEqual([
        'start',
      ]);
      expect(availableWorkOrderActions(access, 2, 'in_progress')).toEqual([
        'submit_review',
      ]);
      // An administrator can do all of it.
      expect(availableWorkOrderActions(access, 1, 'pending_review')).toEqual([
        'complete',
        'reject',
        'cancel',
      ]);
      // A student cannot act on a work order at all, and a closed one offers nothing to anyone.
      expect(availableWorkOrderActions(access, 3, 'open')).toEqual([]);
      expect(availableWorkOrderActions(access, 1, 'completed')).toEqual([]);
    });
  });
});
