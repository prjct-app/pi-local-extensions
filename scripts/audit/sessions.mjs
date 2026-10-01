#!/usr/bin/env node
/**
 * Dynamic context and reliability by extension, from the session files Pi
 * writes (main sessions and pi-subagents child sessions).
 *
 * Context: what each extension puts in the conversation as it runs:
 *   messages it injects (custom_message), results its tools return, and the
 *   arguments the model writes for its tools.
 * Reliability: what goes wrong:
 *   failed tool calls by cause, identical calls repeated back to back,
 *   self_compact notes saved without a compaction, and automated turns
 *   (opened by an extension, not the person) that only relayed or acked.
 *
 *   node scripts/audit/sessions.mjs [--days 7] [--out file.json]
 */
import { createReadStream, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { messageOwner, toolOwner } from './owners.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const days = Number(flag('--days', '7'));
const out = flag('--out');
const since = Date.now() - days * 86_400_000;
const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
const prjct = process.env.PRJCT_HOME || join(homedir(), '.prjct');

/** Tools whose call does no work of its own: a run made only of these just talked. */
const RELAY_ONLY = new Set(['answer', 'team_message', 'team_peers', 'agent_jobs', 'job_status', 'context_usage', 'agent_reply', 'memory_context']);

const CAUSES = [
  ['validation', /Validation failed|must be equal to one of|must have required property|must NOT have additional|Invalid arguments/i],
  ['rejected', /Not delivered|rejected/i],
  ['blocked', /is blocked/i],
  ['not-found', /not found|No such file|ENOENT|Unknown (tool|job|server)|No "/i],
  ['timeout', /timed? ?out|ETIMEDOUT|deadline/i],
  ['auth', /unauthori[sz]ed|forbidden|401|403|authorization_required/i],
  ['aborted', /abort/i],
];
const cause = text => CAUSES.find(([, pattern]) => pattern.test(text))?.[0] ?? 'other';

const files = [];
const walk = (dir, depth) => {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && depth > 0) walk(path, depth - 1);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      try { if (statSync(path).mtimeMs >= since) files.push({ path, child: path.startsWith(join(prjct, 'subagents')) }); } catch { /* gone */ }
    }
  }
};
walk(join(agentDir, 'sessions'), 1);
walk(join(prjct, 'subagents', 'state'), 2);

const owners = {};
const of = owner => owners[owner] ??= {
  calls: 0, errors: 0, causes: {}, loopRepeats: 0, argsChars: 0, resultChars: 0, messageChars: 0, messages: 0,
  automatedRuns: 0, relayOnlyRuns: 0, wastedSaves: 0,
};
const textOf = content => typeof content === 'string' ? content
  : Array.isArray(content) ? content.map(part => (typeof part?.text === 'string' ? part.text : '')).join('\n') : '';

let entriesSeen = 0;
let personRuns = 0;
for (const { path } of files) {
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let lastCall = '';
  let run; // { trigger, tools: Set }
  let idle = true;
  let saves = 0;
  let compactions = 0;
  const close = () => {
    if (!run) return;
    if (run.trigger !== 'person') {
      of(run.trigger).automatedRuns += 1;
      if (run.tools.size && [...run.tools].every(name => RELAY_ONLY.has(name))) of(run.trigger).relayOnlyRuns += 1;
    } else personRuns += 1;
    run = undefined;
  };
  for await (const line of lines) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    entriesSeen += 1;
    const time = Date.parse(entry.timestamp ?? '');
    if (Number.isFinite(time) && time < since) continue;
    if (entry.type === 'compaction') { compactions += 1; continue; }
    if (entry.type === 'custom_message') {
      const owner = messageOwner(entry.customType);
      const record = of(owner);
      record.messages += 1;
      record.messageChars += textOf(entry.content).length;
      if (idle) { close(); run = { trigger: owner, tools: new Set() }; idle = false; }
      continue;
    }
    if (entry.type !== 'message') continue;
    const message = entry.message ?? {};
    if (message.role === 'user') { close(); run = { trigger: 'person', tools: new Set() }; idle = false; lastCall = ''; continue; }
    if (message.role === 'assistant') {
      let terminal = message.stopReason !== 'toolUse';
      for (const part of message.content ?? []) {
        if (part?.type !== 'toolCall') continue;
        const owner = toolOwner(part.name);
        const record = of(owner);
        const argsText = JSON.stringify(part.arguments ?? {});
        record.calls += 1;
        record.argsChars += argsText.length;
        const key = `${part.name}\u0001${argsText}`;
        if (key === lastCall) record.loopRepeats += 1;
        lastCall = key;
        run?.tools.add(part.name);
        if (part.name === 'self_compact') saves += 1;
        if (part.name === 'answer') terminal = true;
      }
      if (terminal) { idle = true; }
      continue;
    }
    if (message.role === 'toolResult') {
      const owner = toolOwner(message.toolName);
      const record = of(owner);
      const text = textOf(message.content);
      record.resultChars += text.length;
      if (message.isError) {
        record.errors += 1;
        const why = cause(text);
        record.causes[why] = (record.causes[why] ?? 0) + 1;
      }
    }
  }
  close();
  if (saves > compactions) of('pi-self-compact').wastedSaves += saves - compactions;
}

const rows = Object.entries(owners).map(([owner, r]) => ({
  owner, ...r,
  errorRate: r.calls ? +(100 * r.errors / r.calls).toFixed(2) : 0,
  failures: r.errors + r.loopRepeats + r.relayOnlyRuns + r.wastedSaves,
  contextTokens: Math.round((r.argsChars + r.resultChars + r.messageChars) / 4),
})).sort((a, b) => b.failures - a.failures || b.contextTokens - a.contextTokens);

const report = { days, files: files.length, entries: entriesSeen, personRuns, rows };
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
const pad = (value, width) => String(value).padStart(width);
console.log(`sessions · last ${days} days · ${files.length} files · ${personRuns.toLocaleString('en-US')} runs you started`);
console.log('owner'.padEnd(26), pad('calls', 7), pad('errors', 7), pad('err%', 6), pad('loops', 6), pad('auto', 6), pad('relay', 6), pad('saves', 6), pad('ctx tok', 11), ' top causes');
for (const r of rows) {
  const top = Object.entries(r.causes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(r.owner.padEnd(26), pad(r.calls, 7), pad(r.errors, 7), pad(r.errorRate, 6), pad(r.loopRepeats, 6), pad(r.automatedRuns, 6), pad(r.relayOnlyRuns, 6), pad(r.wastedSaves, 6), pad(r.contextTokens.toLocaleString('en-US'), 11), ' ', top);
}
