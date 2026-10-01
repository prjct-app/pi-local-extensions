#!/usr/bin/env node
/**
 * Fixed context per request, by extension: tool schemas, the tool's line in
 * the system prompt's <tools> list, and its rules. Read from the exact
 * payloads pi-trace-logger saved (~/Desktop/pi-logs/<session>/payloads).
 * Those files exist only while the trace ran with PI_TRACE_PAYLOADS=full: the
 * logger defaults to summary mode, which writes no payloads.
 *
 *   node scripts/audit/context-payloads.mjs [--days 7] [--out file.json]
 *
 * Tokens are chars/4: right for schemas and prose, which is all this counts.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { toolOwner, TOOL_OWNERS } from './owners.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const days = Number(flag('--days', '7'));
const out = flag('--out');
const root = process.env.PI_TRACE_DIR || join(homedir(), 'Desktop', 'pi-logs');
const since = Date.now() - days * 86_400_000;
const SAMPLES = 4;

const dirDate = name => {
  const match = /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/.exec(name);
  return match ? Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}`) : NaN;
};

/** The three payload shapes Pi sends: Responses (instructions), Anthropic (system), Chat Completions (system message). */
function shape(payload) {
  const tools = (payload.tools ?? []).map(tool => ({
    name: tool.name ?? tool.function?.name ?? '',
    chars: JSON.stringify(tool).length,
  }));
  let system = '';
  if (typeof payload.instructions === 'string') system = payload.instructions;
  else if (typeof payload.system === 'string') system = payload.system;
  else if (Array.isArray(payload.system)) system = payload.system.map(block => block.text ?? '').join('\n');
  else if (Array.isArray(payload.messages)) {
    const first = payload.messages.find(message => message.role === 'system' || message.role === 'developer');
    system = typeof first?.content === 'string' ? first.content : (first?.content ?? []).map(part => part.text ?? '').join('\n');
  }
  return { tools, system };
}

const extensionTools = Object.keys(TOOL_OWNERS).sort((a, b) => b.length - a.length);
const block = (text, tag) => {
  const start = text.indexOf(`<${tag}>`);
  const end = text.indexOf(`</${tag}>`);
  return start >= 0 && end > start ? text.slice(start + tag.length + 2, end) : '';
};

/** chars per owner for one request. */
function attribute(payload) {
  const { tools, system } = shape(payload);
  const owners = {};
  const add = (owner, part, chars) => {
    const entry = owners[owner] ??= { schema: 0, snippet: 0, rules: 0 };
    entry[part] += chars;
  };
  for (const tool of tools) add(toolOwner(tool.name), 'schema', tool.chars);
  for (const line of block(system, 'tools').split('\n')) {
    const name = /^- ([a-z0-9_]+):/.exec(line)?.[1];
    if (name) add(toolOwner(name), 'snippet', line.length + 1);
  }
  for (const line of block(system, 'rules').split('\n')) {
    if (!line.trim()) continue;
    const named = extensionTools.find(name => line.includes(name));
    add(named ? toolOwner(named) : 'core', 'rules', line.length + 1);
  }
  return { owners, systemChars: system.length, toolCount: tools.length };
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

const totals = {};
let sessions = 0;
let requests = 0;
const systemSizes = [];
const toolCounts = [];
for (const name of readdirSync(root).sort()) {
  const at = dirDate(name);
  if (!(at >= since)) continue;
  const dir = join(root, name, 'payloads');
  let files;
  try { files = readdirSync(dir).filter(file => file.endsWith('.json')).sort(); } catch { continue; }
  if (!files.length) continue;
  const picks = [...new Set(Array.from({ length: Math.min(SAMPLES, files.length) }, (_, i) => files[Math.floor(i * (files.length - 1) / Math.max(1, SAMPLES - 1))]))];
  const samples = [];
  for (const file of picks) {
    try { samples.push(attribute(JSON.parse(readFileSync(join(dir, file), 'utf8')))); } catch { /* a torn payload */ }
  }
  if (!samples.length) continue;
  sessions += 1;
  requests += files.length;
  systemSizes.push(median(samples.map(sample => sample.systemChars)));
  toolCounts.push(median(samples.map(sample => sample.toolCount)));
  const owners = new Set(samples.flatMap(sample => Object.keys(sample.owners)));
  for (const owner of owners) {
    const entry = totals[owner] ??= { schema: 0, snippet: 0, rules: 0, requests: 0 };
    for (const part of ['schema', 'snippet', 'rules']) {
      entry[part] += median(samples.map(sample => sample.owners[owner]?.[part] ?? 0)) * files.length;
    }
    entry.requests += files.length;
  }
}

const rows = Object.entries(totals).map(([owner, entry]) => {
  const chars = entry.schema + entry.snippet + entry.rules;
  return { owner, perRequestTokens: Math.round(chars / Math.max(1, requests) / 4), totalTokens: Math.round(chars / 4),
    schemaTokens: Math.round(entry.schema / 4), snippetTokens: Math.round(entry.snippet / 4), rulesTokens: Math.round(entry.rules / 4) };
}).sort((a, b) => b.totalTokens - a.totalTokens);

const report = { days, sessions, requests, medianSystemChars: median(systemSizes), medianTools: median(toolCounts), rows };
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`fixed context per request · last ${days} days · ${sessions} sessions · ${requests.toLocaleString('en-US')} requests · median ${median(toolCounts)} tools, ${median(systemSizes).toLocaleString('en-US')}-char system prompt`);
console.log('owner'.padEnd(18), 'tok/req'.padStart(8), 'schema'.padStart(8), 'snippet'.padStart(8), 'rules'.padStart(8), 'total tok'.padStart(14));
for (const row of rows) {
  console.log(row.owner.padEnd(18), String(row.perRequestTokens).padStart(8), String(Math.round(row.schemaTokens / Math.max(1, requests))).padStart(8),
    String(Math.round(row.snippetTokens / Math.max(1, requests))).padStart(8), String(Math.round(row.rulesTokens / Math.max(1, requests))).padStart(8), row.totalTokens.toLocaleString('en-US').padStart(14));
}
