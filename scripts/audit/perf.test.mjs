import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installedPackage, isolatedEnvironment, scratch } from './perf-support.mjs';

test('audit resolves npm packages and preserves resource filters', t => {
  const root = mkdtempSync(join(tmpdir(), 'perf-fixture-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const pkg = join(root, 'npm/node_modules/@scope/example'); mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), '{}');
  assert.equal(installedPackage('npm:@scope/example@1.2.3', root), pkg);
  assert.deepEqual(installedPackage({ source: 'npm:@scope/example', extensions: ['one.ts'] }, root), { source: pkg, extensions: ['one.ts'] });
  assert.throws(() => installedPackage('npm:missing', root), /not installed/);
});

test('audit isolates state instead of linking credentials or user caches', t => {
  const root = mkdtempSync(join(tmpdir(), 'perf-fixture-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = scratch([], root);
  assert.deepEqual(readdirSync(dir).sort(), ['settings.json', 'workspace']);
  const env = isolatedEnvironment(dir, { PRJCT_HOME: '/real', PI_MEMORY_HOME: '/real-memory' });
  assert.equal(env.PRJCT_HOME, join(dir, 'prjct'));
  assert.equal(env.PI_MEMORY_HOME, env.PRJCT_HOME);
  assert.equal(env.PI_CODING_AGENT_DIR, dir);
});
