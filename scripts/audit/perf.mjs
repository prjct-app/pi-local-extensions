#!/usr/bin/env node
/** Offline, isolated RPC startup and idle measurement. No model requests. */
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { installedPackage, isolatedEnvironment, scratch } from './perf-support.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const runs = Number(flag('--runs', '3'));
const idleSeconds = Number(flag('--idle', '10'));
if (!Number.isInteger(runs) || runs < 1 || runs > 20 || !Number.isFinite(idleSeconds) || idleSeconds < 0 || idleSeconds > 60) {
  throw new Error('Use --runs 1..20 and --idle 0..60.');
}
const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
const settings = JSON.parse(readFileSync(flag('--settings', join(agentDir, 'settings.json')), 'utf8'));
const packages = (settings.packages ?? []).map(entry => installedPackage(entry, agentDir));
const source = entry => typeof entry === 'string' ? entry : entry.source;
const allOnly = args.includes('--all-only');

async function startup(keep, idle = 0) {
  const dir = scratch(keep);
  try {
    return await new Promise((resolve, reject) => {
      const started = process.hrtime.bigint();
      const child = spawn('pi', ['--mode', 'rpc', '--no-session', '--no-skills', '--no-prompt-templates', '--no-context-files'], {
        cwd: join(dir, 'workspace'), env: isolatedEnvironment(dir), stdio: ['pipe', 'pipe', 'pipe'],
      });
      let buffer = '', stderr = '', ready, cpu, finishing = false, error;
      const timers = [];
      const stop = failure => {
        if (finishing) return;
        finishing = true; error = failure;
        child.kill('SIGTERM');
        timers.push(setTimeout(() => child.kill('SIGKILL'), 2_000));
      };
      const cpuSeconds = () => {
        const text = execFileSync('ps', ['-o', 'time=', '-p', String(child.pid)], { encoding: 'utf8' }).trim();
        return text.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0);
      };
      child.once('error', failure => { timers.forEach(clearTimeout); reject(failure); });
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16_000); });
      child.stdin.on('error', failure => stop(failure));
      child.once('close', (code, signal) => {
        timers.forEach(clearTimeout);
        if (error || ready === undefined || /Failed to load extension|Cannot find module|ERR_MODULE_NOT_FOUND|Extension.*(?:failed|error)/i.test(stderr)) {
          reject(error ?? new Error(`Pi did not load cleanly (${code ?? signal}): ${stderr.slice(-2000)}`));
        } else resolve({ ms: ready, ...(cpu === undefined ? {} : { cpu }), stderr });
      });
      child.stdout.on('data', chunk => {
        buffer += chunk;
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) {
          let event; try { event = JSON.parse(line); } catch { continue; }
          if (event.type === 'extension_error') { stop(new Error(JSON.stringify(event))); continue; }
          if (ready !== undefined || event.type !== 'response' || event.id !== 'audit-commands') continue;
          if (event.success === false) { stop(new Error(JSON.stringify(event))); continue; }
          ready = Number(process.hrtime.bigint() - started) / 1e6;
          if (!idle) { stop(); continue; }
          try {
            const before = cpuSeconds();
            timers.push(setTimeout(() => {
              try { cpu = cpuSeconds() - before; stop(); } catch (failure) { stop(failure); }
            }, idle * 1000));
          } catch (failure) { stop(failure); }
        }
      });
      timers.push(setTimeout(() => stop(new Error('Pi RPC startup timed out')), 30_000 + idle * 1000));
      child.stdin.write(`${JSON.stringify({ id: 'audit-commands', type: 'get_commands' })}\n`);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const configurations = { bare: [], all: packages, ...(allOnly ? {} : Object.fromEntries(packages.map(entry => [source(entry), [entry]]))) };
const samples = Object.fromEntries(Object.keys(configurations).map(name => [name, []]));
const first = {};
for (const [name, keep] of Object.entries(configurations)) first[name] = (await startup(keep)).ms;
for (let round = 0; round < runs; round++) {
  for (const [name, keep] of Object.entries(configurations)) {
    const sample = await startup(keep); samples[name].push(sample.ms);
    console.log(JSON.stringify({ round: round + 1, configuration: name, ms: Math.round(sample.ms) }));
  }
}
const idle = {};
if (idleSeconds) for (const name of ['bare', 'all']) idle[name] = (await startup(configurations[name], idleSeconds)).cpu;
const report = { at: new Date().toISOString(), node: process.version, runs, idleSeconds, packages: packages.map(source),
  firstStartMs: first, samplesMs: samples, medianMs: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, median(values)])), idleCpuSeconds: idle };
const out = flag('--out');
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
