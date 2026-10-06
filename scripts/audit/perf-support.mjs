import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Resolve installed packages only; measurements must never install from npm. */
export function installedPackage(entry, agentDir) {
  const source = typeof entry === 'string' ? entry : entry?.source;
  if (typeof source !== 'string') throw new Error('Invalid Pi package entry');
  const npm = /^npm:(@[^/]+\/[^@]+|[^@/]+)(?:@.+)?$/.exec(source);
  const path = npm ? join(agentDir, 'npm', 'node_modules', npm[1])
    : resolve(agentDir, source.startsWith('~/') ? join(homedir(), source.slice(2)) : source);
  if (!existsSync(join(path, 'package.json'))) throw new Error(`Package is not installed: ${source}`);
  return typeof entry === 'string' ? path : { ...entry, source: path };
}

/** No links to credentials, sessions, caches, or other mutable user state. */
export function scratch(packages, root = tmpdir()) {
  const dir = mkdtempSync(join(root, 'pi-audit-agent-'));
  mkdirSync(join(dir, 'workspace'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ packages, extensions: ['-builtin:mcp'], skills: [], theme: 'dark' }));
  return dir;
}

export function isolatedEnvironment(dir, env = process.env) {
  return { ...env, PI_CODING_AGENT_DIR: dir, PRJCT_HOME: join(dir, 'prjct'),
    PI_MEMORY_HOME: join(dir, 'prjct'), PI_MEMORY_DAEMON_HOME: join(dir, 'prjct'),
    PI_SUBAGENTS_OFFLINE: '1', PI_MCP_OFFLINE: '1', PI_TRACE_PAYLOADS: 'off', PI_TRACE_DIR: join(dir, 'trace'), PI_MEMORY_OFFLINE: '1' };
}
