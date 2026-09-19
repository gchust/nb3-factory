// Only reviewed control-plane adapters may execute. Never load an adapter path
// or command supplied by an Issue or the generated application workspace.
// Each engine reads its own configuration namespace, so a version pinned for
// one engine can never be installed for another.
const adapters = new Map([
  [
    'pi',
    {
      module: new URL('./agents/pi.mjs', import.meta.url),
      package: '@earendil-works/pi-coding-agent',
      version: '0.84.4',
      versionEnv: ['CODE_AGENT_VERSION', 'PI_VERSION'],
    },
  ],
  [
    'codebuddy',
    {
      module: new URL('./agents/codebuddy.mjs', import.meta.url),
      package: '@tencent-ai/codebuddy-code',
      version: '2.150.0',
      versionEnv: ['CODEBUDDY_VERSION'],
    },
  ],
]);

export function resolveAgent(env = process.env) {
  const id = env.CODE_AGENT_ENGINE?.trim() || 'pi';
  const adapter = adapters.get(id);
  if (!adapter) throw new Error(`Unsupported CODE_AGENT_ENGINE: ${id}`);
  const [name, version] = adapter.versionEnv
    .map((candidate) => [candidate, env[candidate]?.trim()])
    .find(([, value]) => value) ?? [adapter.versionEnv[0], adapter.version];
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`${name} must be a pinned semantic version.`);
  }
  return { id, ...adapter, version };
}
