import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  accessServiceToken,
  ledgerServiceToken,
} from '../services/contracts.js';
import {
  asString,
  asText,
  readJsonBody,
  requireActor,
  route,
  toBoolean,
  toNumber,
} from './helpers.js';

/** Customer and device ledger endpoints. */
export function createLedgerRouter(app: Application): Hono {
  const router = new Hono();
  const ledger = () => app.container.resolve(ledgerServiceToken);
  const access = () => app.container.resolve(accessServiceToken);

  router.get(
    '/customers',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const items = await ledger().listCustomers(
        actor,
        context.req.query('keyword'),
      );
      return context.json({ data: items });
    }),
  );

  router.post(
    '/customers',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const body = await readJsonBody(context);
      const created = await ledger().createCustomer(actor, {
        name: asText(body.name),
        contactName: asString(body.contactName),
        contactPhone: asString(body.contactPhone),
        address: asString(body.address),
        note: asString(body.note),
      });
      return context.json({ data: created }, 201);
    }),
  );

  router.patch(
    '/customers/:id',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const body = await readJsonBody(context);
      const updated = await ledger().updateCustomer(
        actor,
        Number(context.req.param('id')),
        {
          name: asText(body.name),
          contactName: asString(body.contactName),
          contactPhone: asString(body.contactPhone),
          address: asString(body.address),
          note: asString(body.note),
        },
      );
      return context.json({ data: updated });
    }),
  );

  router.get(
    '/engineers',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const items = await ledger().listEngineers(actor);
      return context.json({ data: items });
    }),
  );

  router.get(
    '/devices',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const items = await ledger().listDevices(actor, {
        customerId: toNumber(context.req.query('customerId')),
        engineerId: context.req.query('engineerId') || undefined,
        enabled: toBoolean(context.req.query('enabled')),
        keyword: context.req.query('keyword') || undefined,
      });
      return context.json({ data: items });
    }),
  );

  router.post(
    '/devices',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const body = await readJsonBody(context);
      const created = await ledger().createDevice(actor, {
        code: asText(body.code),
        name: asText(body.name),
        model: asString(body.model),
        serialNo: asString(body.serialNo),
        customerId: Number(body.customerId),
        engineerId: body.engineerId === null ? null : asString(body.engineerId),
        enabled: toBoolean(body.enabled),
        nextInspectionDate: asString(body.nextInspectionDate),
      });
      return context.json({ data: created }, 201);
    }),
  );

  router.get(
    '/devices/:id',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const device = await ledger().getDevice(
        actor,
        Number(context.req.param('id')),
      );
      return context.json({ data: device });
    }),
  );

  router.patch(
    '/devices/:id',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const body = await readJsonBody(context);
      const updated = await ledger().updateDevice(
        actor,
        Number(context.req.param('id')),
        {
          ...(body.code === undefined ? {} : { code: asText(body.code) }),
          ...(body.name === undefined ? {} : { name: asText(body.name) }),
          ...(body.model === undefined ? {} : { model: asString(body.model) }),
          ...(body.serialNo === undefined
            ? {}
            : { serialNo: asString(body.serialNo) }),
          ...(body.customerId === undefined
            ? {}
            : { customerId: Number(body.customerId) }),
          ...(body.engineerId === undefined
            ? {}
            : {
                engineerId:
                  body.engineerId === null ? null : asString(body.engineerId),
              }),
          ...(body.enabled === undefined
            ? {}
            : { enabled: toBoolean(body.enabled) }),
          ...(body.nextInspectionDate === undefined
            ? {}
            : { nextInspectionDate: asString(body.nextInspectionDate) }),
        },
      );
      return context.json({ data: updated });
    }),
  );

  return router;
}
