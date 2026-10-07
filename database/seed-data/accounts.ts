/**
 * The two isolated demonstration accounts the materials feature is verified with.
 *
 * They exist only so the two levels of access can be exercised: `supervisor` maintains materials and reads all of
 * them, `colleague` reads only the unrestricted ones. Nothing else in the application depends on them.
 */
export interface DemoAccountSeed {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export const demoAccounts = {
  supervisor: {
    username: 'supervisor',
    name: '资料主管',
    email: 'supervisor@example.com',
    password: 'supervisor123',
  },
  colleague: {
    username: 'colleague',
    name: '普通同事',
    email: 'colleague@example.com',
    password: 'colleague123',
  },
} as const satisfies Record<string, DemoAccountSeed>;
