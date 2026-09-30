import { defineSeed } from '@nocobase/db';

/**
 * Example materials for the first administrator, so a fresh installation opens the materials page with something
 * in it instead of an empty screen.
 *
 * The rows carry no attachments on purpose: an attachment is a File Repository record whose bytes live on a disk,
 * and inventing one here would produce a link that 404s. The two titles are the fictional materials the task asks
 * for; an attachment is added the ordinary way, through the form. The seed is idempotent by title, and it simply
 * does nothing when the initial administrator has not been created.
 */
const SAMPLE_TITLES: readonly string[] = [
  'Site survey photos (sample)',
  'Signed delivery note (sample)',
];

export default defineSeed({
  name: '202609300001_create_material_samples',
  async run({ query, config }) {
    const initialAdmin = config.get('users.initialAdmin');
    const username =
      initialAdmin &&
      typeof initialAdmin === 'object' &&
      !Array.isArray(initialAdmin) &&
      typeof (initialAdmin as { username?: unknown }).username === 'string'
        ? (initialAdmin as { username: string }).username.toLowerCase()
        : 'nocobase';

    const owner = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', username)
      .executeTakeFirst();
    if (!owner) return;

    for (const title of SAMPLE_TITLES) {
      const existing = await query
        .selectFrom('materials')
        .select('id')
        .where('ownerId', '=', owner.id)
        .where('title', '=', title)
        .executeTakeFirst();
      if (existing) continue;

      const now = new Date();
      await query
        .insertInto('materials')
        .values({
          title,
          ownerId: owner.id,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
