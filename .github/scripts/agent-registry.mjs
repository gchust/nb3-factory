// Only reviewed control-plane adapters may execute. Never load an adapter path
// or command supplied by an Issue or the generated application workspace.
const adapters = new Map([
  [
    'pi',
    {
      module: new URL('./agents/pi.mjs', import.meta.url),
      package: '@earendil-works/pi-coding-agent',
      version: '0.84.4',
    },
  ],
]);

export function resolveAgent(env = process.env) {
  const id = env.CODE_AGENT_ENGINE?.trim() || 'pi';
  const adapter = adapters.get(id);
  if (!adapter) throw new Error(`Unsupported CODE_AGENT_ENGINE: ${id}`);
  const version = env.CODE_AGENT_VERSION?.trim() || adapter.version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('CODE_AGENT_VERSION must be a pinned semantic version.');
  }
  return { id, ...adapter, version };
}
