import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Engineer groups. A group is an authorization subject: the engineer job can be
 * assigned to the group, and every member inherits it. Membership is plain
 * application data, not a second permission system.
 */
export const migration: MigrationDefinition = defineMigration({
  name: '202609100005_create_service_teams',
  async up({ builder }) {
    await builder.createCollection(
      'serviceTeams',
      (collection) => {
        collection.increments('id');
        collection.string('code', { length: 64, nullable: false });
        collection.string('name', { length: 255, nullable: false });
        collection.string('description', { length: 512, nullable: true });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.unique('code', { name: 'service_teams_code_unique' });
      },
      { ifNotExists: true },
    );

    await builder.createCollection(
      'serviceTeamMembers',
      (collection) => {
        collection.increments('id');
        collection.string('userId', { length: 64, nullable: false });
        collection.string('memberRole', { length: 64, nullable: true });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection
          .belongsTo('team', 'serviceTeams')
          .foreignKey('teamId')
          .foreignKeyType('integer')
          .targetKey('id')
          .constraints(true)
          .onDelete('cascade');
        collection.index('teamId', { name: 'service_team_members_team_idx' });
        collection.index('userId', { name: 'service_team_members_user_idx' });
        collection.unique(['teamId', 'userId'], {
          name: 'service_team_members_team_user_unique',
        });
      },
      { ifNotExists: true },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('serviceTeamMembers');
    await builder.dropCollection('serviceTeams');
  },
});

export default migration;
