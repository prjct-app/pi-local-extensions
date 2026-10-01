#!/usr/bin/env node
/**
 * What each extension costs Pi to carry: startup time (all extensions, then
 * each one left out), idle CPU, disk it writes, and build size.
 *
 *   node scripts/audit/perf.mjs [--runs 3] [--idle 60] [--out file.json]
 *
 * Startup runs `pi --mode rpc --no-session` in a scratch agent dir whose
 * settings list a chosen set of packages, and times spawn → first command
 * list. No model is called and no session is written.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const runs = Number(flag('--runs', '3'));
const idleSeconds = Number(flag('--idle', '60'));
const out = flag('--out');
const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
const settings = JSON.parse(readFileSync(join(agentDir, 'settings.json'), 'utf8'));
// Absolute paths: Pi caches each extension's load by path, and a relative path
// under a fresh scratch dir would be a cache miss on every run.
const packages = (settings.packages ?? []).map(pkg => (pkg.startsWith('/') ? pkg : join(agentDir, pkg)));
const short = pkg => pkg.replace(`${agentDir}/`, '');

/** A scratch agent dir: everything linked from the real one, settings rewritten. */
function scratch(keep) {
  const dir = mkdtempSync(join(tmpdir(), 'pi-audit-agent-'));
  for (const name of readdirSync(agentDir)) {
    if (name === 'settings.json' || name === 'sessions') continue;
    symlinkSync(join(agentDir, name), join(dir, name));
  }
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ ...settings, packages: keep }));
  return dir;
}

/** ms from spawn to the RPC answer listing commands, and the child's CPU seconds. */
function startup(keep, idle = 0) {
  return new Promise(resolve => {
    const dir = scratch(keep);
    const started = process.hrtime.bigint();
    const child = spawn('pi', ['--mode', 'rpc', '--no-session'], { cwd: tmpdir(), env: { ...process.env, PI_CODING_AGENT_DIR: dir, PI_TRACE_PAYLOADS: 'off', PI_TRACE_DIR: join(dir, 'trace') }, stdio: ['pipe', 'pipe', 'ignore'] });
    let buffer = '';
    let ready;
    const finish = cpu => {
      child.once('exit', () => {
        try { rmSync(dir, { recursive: true, force: true }); } catch { /* the child may still be flushing; the dir is in tmp */ }
        resolve({ ms: ready, cpu });
      });
      child.kill('SIGTERM');
    };
    const cpuSeconds = () => {
      try {
        const time = execFileSync('ps', ['-o', 'time=', '-p', String(child.pid)], { encoding: 'utf8' }).trim();
        const [m, s] = time.split(':');
        return Number(m) * 60 + Number(s);
      } catch { return NaN; }
    };
    child.stdout.on('data', chunk => {
      buffer += chunk;
      if (ready === undefined && buffer.includes('"type":"response"')) {
        ready = Number(process.hrtime.bigint() - started) / 1e6;
        if (!idle) finish(undefined);
        else {
          const before = cpuSeconds();
          setTimeout(() => finish(cpuSeconds() - before), idle * 1000);
        }
      }
    });
    child.stdin.write(`${JSON.stringify({ id: '1', type: 'get_commands' })}\n`);
    setTimeout(() => { if (ready === undefined) { ready = NaN; finish(undefined); } }, 60_000);
  });
}

const median = values => { const s = values.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

const report = { runs, startup: {}, idle: {}, disk: {}, builds: {} };
// Rounds interleave every configuration, so load and cache drift hit all of them alike;
// each extension is timed alone against the same round's bare Pi.
console.log(`startup · ${runs} interleaved rounds · ${packages.length} packages`);
const samples = { none: [], all: [], alone: Object.fromEntries(packages.map(pkg => [pkg, []])) };
// One unmeasured pass warms Pi's per-path load cache, the state of every start after the first.
for (const keep of [[], packages, ...packages.map(pkg => [pkg])]) await startup(keep);
for (let round = 0; round < runs; round++) {
  const none = (await startup([])).ms;
  samples.none.push(none);
  samples.all.push((await startup(packages)).ms - none);
  for (const pkg of packages) samples.alone[pkg].push((await startup([pkg])).ms - none);
}
report.startup.none = median(samples.none);
report.startup.all = median(samples.all);
report.startup.alone = Object.fromEntries(packages.map(pkg => [pkg, median(samples.alone[pkg])]));
console.log(`  bare Pi ${report.startup.none.toFixed(0)} ms · all extensions add ${report.startup.all.toFixed(0)} ms`);
for (const [pkg, cost] of Object.entries(report.startup.alone).sort((a, b) => b[1] - a[1])) console.log(`  ${short(pkg).padEnd(28)} ${cost.toFixed(0).padStart(6)} ms alone`);

console.log(`idle CPU over ${idleSeconds}s after startup`);
for (const [label, keep] of [['none', []], ['all', packages]]) {
  const { cpu } = await startup(keep, idleSeconds);
  report.idle[label] = cpu;
  console.log(`  ${label.padEnd(6)} ${cpu.toFixed(2)} CPU-s (${(100 * cpu / idleSeconds).toFixed(1)}% of a core)`);
}

const du = path => { try { return Number(execFileSync('du', ['-sk', path], { encoding: 'utf8' }).split('\t')[0]) * 1024; } catch { return 0; } };
const prjct = process.env.PRJCT_HOME || join(homedir(), '.prjct');
for (const [label, path] of [['pi-trace-logger (~/Desktop/pi-logs)', join(homedir(), 'Desktop', 'pi-logs')], ['pi sessions', join(agentDir, 'sessions')],
  ...readdirSync(prjct).filter(name => { try { return statSync(join(prjct, name)).isDirectory(); } catch { return false; } }).map(name => [`~/.prjct/${name}`, join(prjct, name)])]) {
  report.disk[label] = du(path);
}
console.log('disk');
for (const [label, bytes] of Object.entries(report.disk).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${label.padEnd(40)} ${(bytes / 1e9).toFixed(2)} GB`);
console.log('builds');
for (const pkg of packages) {
  report.builds[short(pkg)] = du(pkg);
}
for (const [pkg, bytes] of Object.entries(report.builds).sort((a, b) => b[1] - a[1])) console.log(`  ${pkg.padEnd(28)} ${(bytes / 1e6).toFixed(1)} MB`);
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
