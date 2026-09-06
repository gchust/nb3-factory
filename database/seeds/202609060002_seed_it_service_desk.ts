import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Demo data for the IT service desk: a small staff directory plus tickets covering every category, priority and
 * status. Deterministic and repeatable — users are skipped once their email exists, and tickets are only inserted on
 * an empty table, so a repeat run never duplicates or overwrites anything.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609060002_seed_it_service_desk',

  async run({ query }) {
    const now = new Date();

    // The `user` and `account` tables belong to @nocobase/app-plugin-authentication. Insert the staff directory the
    // same way that plugin's own seed does: a user row plus a credential account. Re-running skips existing emails.
    const staff = [
      {
        name: 'Wei Zhang',
        username: 'zhang.wei',
        email: 'zhang.wei@example.com',
      },
      {
        name: 'Na Li',
        username: 'li.na',
        email: 'li.na@example.com',
      },
      {
        name: 'Fang Wang',
        username: 'wang.fang',
        email: 'wang.fang@example.com',
      },
      {
        name: 'Jie Chen',
        username: 'chen.jie',
        email: 'chen.jie@example.com',
      },
      {
        name: 'Yang Liu',
        username: 'liu.yang',
        email: 'liu.yang@example.com',
      },
    ] as const;

    const staffIds = new Map<string, string>();
    for (const member of staff) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('email', '=', member.email)
        .executeTakeFirst();

      if (existing) {
        staffIds.set(member.email, String(existing.id));
        continue;
      }

      const userId = crypto.randomUUID();
      await query
        .insertInto('user')
        .values({
          id: userId,
          name: member.name,
          username: member.username,
          email: member.email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: crypto.randomUUID(),
          issuer: 'local:credential',
          accountId: userId,
          providerId: 'credential',
          userId,
          password: await hashPassword('itdesk123'),
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      staffIds.set(member.email, userId);
    }

    const requester = (email: string) => {
      const id = staffIds.get(email);
      if (!id) {
        throw new Error(`Seed user ${email} was not created.`);
      }
      return id;
    };

    const anyTicket = await query
      .selectFrom('itTickets')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (anyTicket) {
      return;
    }

    await query
      .insertInto('itTickets')
      .values([
        {
          title: 'Laptop will not boot after system update',
          description:
            'After installing last night’s update the laptop stays on a black screen. The power LED is on and the fan spins, but nothing else happens.',
          category: 'hardware',
          priority: 'urgent',
          status: 'inProgress',
          requesterId: requester('wang.fang@example.com'),
          assigneeId: requester('zhang.wei@example.com'),
          resolution: null,
          createdAt: new Date('2026-08-28T02:00:00.000Z'),
          updatedAt: new Date('2026-08-28T06:30:00.000Z'),
        },
        {
          title: 'Cannot connect to the office Wi-Fi',
          description:
            'The laptop joins the guest network but not the staff network. Other devices on the same desk connect without a problem.',
          category: 'network',
          priority: 'high',
          status: 'pending',
          requesterId: requester('chen.jie@example.com'),
          assigneeId: null,
          resolution: null,
          createdAt: new Date('2026-09-01T01:15:00.000Z'),
          updatedAt: new Date('2026-09-01T01:15:00.000Z'),
        },
        {
          title: 'Email account locked out',
          description:
            'Too many failed sign-in attempts triggered a lock. The account needs to be unlocked or the password reset.',
          category: 'account',
          priority: 'high',
          status: 'inProgress',
          requesterId: requester('liu.yang@example.com'),
          assigneeId: requester('li.na@example.com'),
          resolution: null,
          createdAt: new Date('2026-08-30T04:40:00.000Z'),
          updatedAt: new Date('2026-08-30T09:10:00.000Z'),
        },
        {
          title: 'VPN disconnects every few minutes',
          description:
            'Remote sessions drop repeatedly. Reconnecting works for a short time before the tunnel goes down again.',
          category: 'network',
          priority: 'normal',
          status: 'resolved',
          requesterId: requester('wang.fang@example.com'),
          assigneeId: requester('li.na@example.com'),
          resolution:
            'Replaced the outdated VPN client and switched the profile to the new gateway. Connection has been stable since.',
          createdAt: new Date('2026-08-20T03:00:00.000Z'),
          updatedAt: new Date('2026-08-24T08:00:00.000Z'),
        },
        {
          title: 'Monitor flickers when the AC unit runs',
          description:
            'The screen in office 3B flickers intermittently. The issue started around the same time the ceiling AC was serviced.',
          category: 'hardware',
          priority: 'normal',
          status: 'resolved',
          requesterId: requester('liu.yang@example.com'),
          assigneeId: requester('zhang.wei@example.com'),
          resolution:
            'Tested with a different power circuit; the monitor is fine. The office power strip was replaced.',
          createdAt: new Date('2026-08-18T05:20:00.000Z'),
          updatedAt: new Date('2026-08-19T07:45:00.000Z'),
        },
        {
          title: 'Permission needed to install design software',
          description:
            'The design team needs a licensed copy of the vector tool installed on two workstations.',
          category: 'software',
          priority: 'low',
          status: 'closed',
          requesterId: requester('chen.jie@example.com'),
          assigneeId: requester('zhang.wei@example.com'),
          resolution:
            'Installed the licensed version on both workstations and documented the license seat usage.',
          createdAt: new Date('2026-08-10T02:30:00.000Z'),
          updatedAt: new Date('2026-08-12T09:00:00.000Z'),
        },
        {
          title: 'Printer in the HR office not printing',
          description:
            'The shared printer shows “offline” for everyone in HR. The device itself is powered on and has paper.',
          category: 'hardware',
          priority: 'normal',
          status: 'pending',
          requesterId: requester('liu.yang@example.com'),
          assigneeId: null,
          resolution: null,
          createdAt: new Date('2026-09-02T06:05:00.000Z'),
          updatedAt: new Date('2026-09-02T06:05:00.000Z'),
        },
        {
          title: 'ERP system is very slow after the upgrade',
          description:
            'Opening orders now takes more than a minute. Colleagues on the sales floor report the same slowness.',
          category: 'software',
          priority: 'high',
          status: 'inProgress',
          requesterId: requester('wang.fang@example.com'),
          assigneeId: requester('li.na@example.com'),
          resolution: null,
          createdAt: new Date('2026-08-31T02:50:00.000Z'),
          updatedAt: new Date('2026-09-01T01:20:00.000Z'),
        },
        {
          title: 'Onboarding account setup for a new employee',
          description:
            'A new hire starts next Monday and needs a mailbox, directory account and the standard tool licenses.',
          category: 'account',
          priority: 'low',
          status: 'closed',
          requesterId: requester('chen.jie@example.com'),
          assigneeId: requester('li.na@example.com'),
          resolution:
            'Created the accounts and licenses; handed the credentials to HR for the first-day briefing.',
          createdAt: new Date('2026-07-28T08:10:00.000Z'),
          updatedAt: new Date('2026-07-29T03:40:00.000Z'),
        },
        {
          title: 'Cannot access the shared drive',
          description:
            'The finance shared folder is not reachable from the new laptop. The drive maps for other departments.',
          category: 'network',
          priority: 'urgent',
          status: 'pending',
          requesterId: requester('liu.yang@example.com'),
          assigneeId: null,
          resolution: null,
          createdAt: new Date('2026-09-03T05:25:00.000Z'),
          updatedAt: new Date('2026-09-03T05:25:00.000Z'),
        },
        {
          title: 'Meeting room video conference not working',
          description:
            'The room kit starts but the far-end side sees no video. The display shows the correct HDMI input.',
          category: 'hardware',
          priority: 'normal',
          status: 'resolved',
          requesterId: requester('wang.fang@example.com'),
          assigneeId: requester('zhang.wei@example.com'),
          resolution:
            'Replaced the faulty USB camera cable and updated the room kit firmware.',
          createdAt: new Date('2026-08-22T04:15:00.000Z'),
          updatedAt: new Date('2026-08-23T02:55:00.000Z'),
        },
        {
          title: 'Password reset for the customer portal',
          description:
            'The employee forgot the customer portal password and the self-service reset does not deliver the email.',
          category: 'account',
          priority: 'low',
          status: 'pending',
          requesterId: requester('chen.jie@example.com'),
          assigneeId: null,
          resolution: null,
          createdAt: new Date('2026-09-04T03:45:00.000Z'),
          updatedAt: new Date('2026-09-04T03:45:00.000Z'),
        },
      ])
      .execute();
  },
});

export default seed;
