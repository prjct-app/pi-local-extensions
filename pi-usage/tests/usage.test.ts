import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import piUsage from '../index.ts';
import { Pricing, estimate, isFree, parseCatalog, rateFor } from '../pricing.ts';
import { labelOf, ownersOf, priceRow, subsidyOf, summarize, ticketGroups, usd } from '../report.ts';
import { Scanner, absorb, childDir, emptyFile, scanFile, ticketsIn, type FileUsage } from '../scan.ts';

const dir = () => {
  const path = join(tmpdir(), `pi-usage-test-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(path, { recursive: true });
  return path;
};
const at = (minute: number) => new Date(Date.UTC(2026, 8, 30, 12, minute)).toISOString();
const usage = (input: number, output: number, total: number, cacheRead = 0) =>
  ({ input, output, cacheRead, cacheWrite: 0, totalTokens: input + output + cacheRead, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total } });
const header = (id: string, minute = 0, extra: object = {}) => ({ type: 'session', version: 3, id, timestamp: at(minute), cwd: '/work/app', ...extra });
const reply = (minute: number, model: string, u: object, provider = 'openai-codex') =>
  ({ type: 'message', id: `m${minute}`, parentId: null, timestamp: at(minute), message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }], provider, model, usage: u } });
const user = (minute: number, text: string) =>
  ({ type: 'message', id: `u${minute}`, parentId: null, timestamp: at(minute), message: { role: 'user', content: [{ type: 'text', text }] } });
const jsonl = (entries: object[]) => entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
const fileOf = (entries: object[]): FileUsage => {
  const file = emptyFile('/x.jsonl');
  for (const entry of entries) absorb(file, entry);
  return file;
};
const rowTotal = (file: FileUsage, kind: string) => Object.values(file.rows).filter(row => row.kind === kind).reduce((sum, row) => sum + row.usd, 0);

test('replies, usage entries and compactions are counted; compactions take the last model', () => {
  const file = fileOf([
    header('s1'),
    { type: 'model_change', id: 'a', parentId: null, timestamp: at(1), provider: 'xai', modelId: 'grok-4.7' },
    reply(2, 'gpt-6-sol', usage(100, 10, 0.5)),
    { type: 'usage', id: 'w', parentId: null, timestamp: at(3), kind: 'cache_warm', provider: 'openai-codex', model: 'gpt-6-sol', usage: usage(5, 1, 0.01) },
    { type: 'compaction', id: 'c', parentId: null, timestamp: at(4), summary: 's', firstKeptEntryId: 'a', tokensBefore: 9, usage: usage(50, 5, 0.2) },
    { type: 'message', id: 't', parentId: null, timestamp: at(5), message: { role: 'toolResult', content: [], usage: usage(1, 1, 99) } },
  ]);
  assert.equal(rowTotal(file, 'reply'), 0.5);
  assert.equal(rowTotal(file, 'cache_warm'), 0.01);
  const compaction = Object.values(file.rows).find(row => row.kind === 'compaction')!;
  assert.equal(compaction.model, 'gpt-6-sol', 'the model of the last reply, not the earlier model_change');
  assert.equal(compaction.usd, 0.2);
  assert.equal(Object.values(file.rows).reduce((sum, row) => sum + row.calls, 0), 3, 'tool results never count');
});

test('a fork does not count its parent again', () => {
  const file = fileOf([
    header('fork', 30, { parentSession: '/sessions/parent.jsonl' }),
    reply(10, 'gpt-6-sol', usage(100, 10, 1)),
    reply(20, 'gpt-6-sol', usage(100, 10, 2)),
    reply(31, 'gpt-6-sol', usage(100, 10, 4)),
  ]);
  assert.equal(rowTotal(file, 'reply'), 4);
});

test('a file that grew is read from where the last scan stopped', async () => {
  const path = join(dir(), 'a.jsonl');
  writeFileSync(path, jsonl([header('s1'), reply(1, 'gpt-6-sol', usage(10, 1, 1))]));
  const first = (await scanFile(path))!;
  assert.equal(rowTotal(first, 'reply'), 1);
  const offset = first.offset;
  // A line still being written is left for the next scan.
  appendFileSync(path, JSON.stringify(reply(2, 'gpt-6-sol', usage(10, 1, 2))));
  const partial = (await scanFile(path, first))!;
  assert.equal(partial.offset, offset);
  assert.equal(rowTotal(partial, 'reply'), 1);
  appendFileSync(path, '\n');
  const second = (await scanFile(path, partial))!;
  assert.equal(rowTotal(second, 'reply'), 3);
  assert.equal(rowTotal(first, 'reply'), 1, 'the cached totals are not mutated');
  assert.equal(await scanFile(path, second), second, 'an unchanged file is not read again');
});

test('a rewritten or truncated file is read from the start', async () => {
  const path = join(dir(), 'a.jsonl');
  writeFileSync(path, jsonl([header('s1'), reply(1, 'gpt-6-sol', usage(10, 1, 1)), reply(2, 'gpt-6-sol', usage(10, 1, 1))]));
  const first = (await scanFile(path))!;
  writeFileSync(path, jsonl([header('s2'), reply(1, 'gpt-6-sol', usage(10, 1, 5))]));
  const again = (await scanFile(path, first))!;
  assert.equal(again.id, 's2');
  assert.equal(rowTotal(again, 'reply'), 5);
});

test('the scanner cache survives a restart and forgets deleted files', async () => {
  const root = dir();
  const sessions = join(root, 'sessions', '--work--');
  mkdirSync(sessions, { recursive: true });
  const path = join(sessions, 'a.jsonl');
  writeFileSync(path, jsonl([header('s1'), reply(1, 'gpt-6-sol', usage(10, 1, 1))]));
  const scanner = new Scanner(join(root, 'cache.json'));
  await scanner.load();
  await scanner.scan(path);
  await scanner.save();
  const again = new Scanner(join(root, 'cache.json'));
  await again.load();
  assert.equal(rowTotal(again.files.get(path)!, 'reply'), 1);
  again.prune(join(root, 'sessions'), new Set());
  assert.equal(again.files.size, 0);
});

test('catalog rates: variants skipped, longest name wins, provider word as vendor prefix', () => {
  const rates = parseCatalog({ data: [
    { id: 'openai/gpt-6-sol', pricing: { prompt: '0.000002', completion: '0.00001', input_cache_read: '0.0000002' } },
    { id: 'openai/gpt-6-sol-pro', pricing: { prompt: '0.000004', completion: '0.00002' } },
    { id: 'openai/gpt-6-sol:batch', pricing: { prompt: '0.000001', completion: '0.000005' } },
    { id: '~moonshotai/kimi-latest', pricing: { prompt: '1', completion: '1' } },
    { id: 'moonshotai/kimi-k3', pricing: { prompt: '0.00000028', completion: '0.00001', input_cache_read: '0.00000028' } },
    { id: 'minimax/minimax-m3', pricing: { prompt: '0.0000003', completion: '0.0000012', input_cache_read: '0.00000006' } },
    { id: 'xiaomi/mimo-v2.5-pro', pricing: { prompt: '0.000000435', completion: '0.00000087' } },
  ] });
  assert.equal(rates.length, 5);
  assert.equal(rateFor(rates, 'openai-codex', 'gpt-6-sol')?.id, 'openai/gpt-6-sol');
  assert.equal(rateFor(rates, 'openai-codex', 'gpt-6-sol-pro')?.id, 'openai/gpt-6-sol-pro');
  assert.equal(rateFor(rates, 'minimax', 'MiniMax-M3')?.id, 'minimax/minimax-m3');
  assert.equal(rateFor(rates, 'kimi-coding', 'k3-256k')?.id, 'moonshotai/kimi-k3');
  assert.equal(rateFor(rates, 'xiaomi-token-plan-sgp', 'mimo-v2.5-pro')?.id, 'xiaomi/mimo-v2.5-pro');
  assert.equal(rateFor(rates, 'acme', 'nothing-like-it'), undefined);
  const { usd: amount, unpriced } = estimate({ input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 0 }, rateFor(rates, 'minimax', 'MiniMax-M3')!);
  assert.ok(Math.abs(amount - 1.56) < 1e-9);
  assert.equal(unpriced, 0);
});

test('list price: Pi first, catalog for $0 tokens, free stays free, unknown stays unpriced', () => {
  const rates = parseCatalog({ data: [{ id: 'minimax/minimax-m3', pricing: { prompt: '0.000001', completion: '0.000002' } }] });
  const row = (provider: string, model: string, recorded: number, zero: number, cacheRead = 0) => ({
    kind: 'reply', provider, model, calls: 1,
    tokens: { input: zero, output: 0, cacheRead, cacheWrite: 0 }, usd: recorded,
    zero: { input: zero, output: 0, cacheRead, cacheWrite: 0 },
  });
  assert.deepEqual(priceRow(row('openai-codex', 'gpt-6-sol', 3, 0), rates), { recorded: 3, estimated: 0, unpriced: 0 });
  const estimated = priceRow(row('minimax', 'MiniMax-M3', 0, 1_000_000, 500), rates);
  assert.equal(estimated.estimated, 1);
  assert.equal(estimated.unpriced, 500, 'cache tokens without a listed cache rate are not guessed');
  assert.deepEqual(priceRow(row('openrouter', 'z-ai/glm-5.2:free', 0, 1000), rates), { recorded: 0, estimated: 0, unpriced: 0 });
  assert.ok(isFree('ollama', 'qwen3.6:latest'));
  assert.deepEqual(priceRow(row('kimi-coding', 'k9', 0, 1000), rates), { recorded: 0, estimated: 0, unpriced: 1000 });
});

test('the catalog is cached on disk and a failed fetch keeps the last good one', async () => {
  const file = join(dir(), 'pricing.json');
  const payload = { data: [{ id: 'a/model-x', pricing: { prompt: '0.000001', completion: '0.000002' } }] };
  let now = 1_000;
  const good = new Pricing(file, async () => payload, () => now);
  assert.equal(await good.load(), true);
  assert.equal(good.rates.length, 1);
  now += 2 * 24 * 60 * 60 * 1000;
  const offline = new Pricing(file, async () => { throw new Error('offline'); }, () => now);
  await offline.load();
  assert.equal(offline.rates[0]?.id, 'a/model-x');
});

test('tickets: links and Jira keys, not version strings', () => {
  assert.deepEqual(ticketsIn('Fix PROJ-123 please, UTF-8 and ISO-8601 are fine, so is GPT-5'), ['PROJ-123']);
  assert.deepEqual(ticketsIn('see https://acme.atlassian.net/browse/OPS-42 and https://github.com/acme/app/issues/7'), ['OPS-42', 'acme/app#7']);
  assert.deepEqual(ticketsIn('https://app.clickup.com/t/86b1abc'), ['clickup:86b1abc']);
  assert.deepEqual(ticketsIn('session D9C7E1A9-5842-4A1B-9C3D-1234567890AB and AB-12-x'), []);
  assert.deepEqual(ticketsIn('https://docs.google.com/document/d/1AbCdEfGhIjK/edit'), ['gdoc:1AbCdEfG']);
});

test('a session is named by /name, then its ticket, then its first prompt', () => {
  const base = [header('s1'), user(1, 'Work on https://acme.atlassian.net/browse/OPS-42\nthe login bug')];
  assert.equal(labelOf(fileOf(base)), 'OPS-42 · Work on https://acme.atlassian.net/browse/OPS-42');
  assert.equal(labelOf(fileOf([...base, { type: 'session_info', id: 'n', parentId: null, timestamp: at(2), name: 'login fix' }])), 'login fix');
  assert.equal(labelOf(fileOf([header('s2'), user(1, 'refactor the parser')])), 'refactor the parser');
  const groups = ticketGroups([
    { file: fileOf(base), usd: 2 },
    { file: fileOf([header('s3'), user(1, 'OPS-42 again')]), usd: 3 },
    { file: fileOf([header('s4'), user(1, 'no ticket')]), usd: 9 },
  ]);
  assert.deepEqual(groups, [{ ticket: 'OPS-42', sessions: 2, usd: 5 }]);
});

test('subagent runs belong to the session that launched them, grandchildren too', () => {
  const state = '/prjct/subagents/state';
  const main = { ...fileOf([header('main'), reply(1, 'gpt-6-sol', usage(1, 1, 1))]), path: '/sessions/main.jsonl' };
  const child = { ...fileOf([header('child'), reply(2, 'gpt-6-sol', usage(1, 1, 2))]), path: join(childDir(state, 'main'), 'j_1', 'c.jsonl') };
  const grandchild = { ...fileOf([header('grand'), reply(3, 'gpt-6-sol', usage(1, 1, 4))]), path: join(childDir(state, 'child'), 'j_2', 'g.jsonl') };
  const stray = { ...fileOf([header('stray'), reply(3, 'gpt-6-sol', usage(1, 1, 8))]), path: join(childDir(state, 'unknown'), 'j_3', 's.jsonl') };
  const owners = ownersOf([main], [child, grandchild, stray], state);
  assert.deepEqual(owners.get(main.path)?.map(file => file.id), ['child', 'grand']);
  const summary = summarize([main], owners.get(main.path)!, []);
  assert.equal(subsidyOf(summary.total), 7);
  assert.deepEqual(summary.kinds.map(kind => kind.label), ['subagent calls', 'replies']);
  assert.equal(usd(1234.5), '$1,234.50');
  assert.equal(usd(0.001), '<$0.01');
});

/** A Pi API that records every call, to prove the extension never reaches the model. */
function recordingPi() {
  const calls: string[] = [];
  const events = new Map<string, (event: unknown, ctx: unknown) => unknown>();
  const commands = new Map<string, any>();
  const pi = new Proxy({}, {
    get: (_target, prop: string) => (...args: any[]) => {
      calls.push(prop);
      if (prop === 'on') events.set(args[0], args[1]);
      if (prop === 'registerCommand') commands.set(args[0], args[1]);
    },
  });
  return { pi: pi as any, calls, events, commands };
}

test('nothing reaches the model: no tools, no messages, no prompt hooks', async () => {
  const { pi, calls, events, commands } = recordingPi();
  piUsage(pi);
  assert.deepEqual([...new Set(calls)].sort(), ['on', 'registerCommand']);
  // Only passive events: nothing that edits the prompt, the context, a request or a tool call.
  assert.deepEqual([...events.keys()].sort(), ['agent_end', 'message_end', 'session_shutdown', 'session_start']);
  assert.deepEqual([...commands.keys()], ['usage']);
  assert.equal(events.get('message_end')!({ type: 'message_end', message: { role: 'assistant' } }, {}), undefined);
  assert.equal(events.get('agent_end')!({ type: 'agent_end', messages: [] }, {}), undefined);
});

test('the line above the editor shows the session, then the project once read, and follows each reply', async () => {
  const root = dir();
  process.env.PRJCT_HOME = join(root, 'prjct');
  process.env.PI_CODING_AGENT_DIR = join(root, 'agent');
  const projectDir = join(root, 'agent', 'sessions', '--work-app--');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, 'old.jsonl'), jsonl([header('old'), reply(2, 'gpt-6-sol', usage(100, 10, 2))]));
  const statuses: [string, string | undefined][] = [];
  const entries = [user(5, 'hello'), reply(6, 'gpt-6-sol', usage(10, 1, 1))];
  const ctx = {
    hasUI: true, mode: 'tui', cwd: '/work/app',
    ui: { theme: { fg: (_tone: string, text: string) => text }, setStatus: (key: string, text: string | undefined) => statuses.push([key, text]), setWidget() {}, notify() {} },
    sessionManager: {
      getSessionDir: () => projectDir, getSessionFile: () => join(projectDir, 'now.jsonl'), getSessionId: () => 'now',
      getHeader: () => header('now', 5), getEntries: () => entries,
    },
  };
  const { pi, events } = recordingPi();
  piUsage(pi);
  const line = () => statuses.filter(([key]) => key === 'fact:usage').at(-1)?.[1];
  assert.equal(events.get('session_start')!({ type: 'session_start' }, ctx), undefined);
  assert.equal(line(), '$1.00 session');
  events.get('message_end')!({ type: 'message_end', message: { role: 'assistant', provider: 'openai-codex', model: 'gpt-6-sol', usage: usage(10, 1, 0.5) } }, ctx);
  assert.equal(line(), '$1.50 session', 'a reply shows up before the run ends');
  await new Promise(resolve => setTimeout(resolve, 1_800));
  assert.equal(line(), '$1.50 session · $3.50 project');
  events.get('session_shutdown')!({ type: 'session_shutdown' }, ctx);
  assert.equal(line(), undefined, 'the line clears with the session');
});

test('/usage without a TUI reports session, project and every project as text', async () => {
  const root = dir();
  process.env.PRJCT_HOME = join(root, 'prjct');
  process.env.PI_CODING_AGENT_DIR = join(root, 'agent');
  const projectDir = join(root, 'agent', 'sessions', '--work-app--');
  const otherDir = join(root, 'agent', 'sessions', '--work-other--');
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(otherDir, { recursive: true });
  writeFileSync(join(projectDir, 'old.jsonl'), jsonl([header('old'), user(1, 'Fix OPS-7'), reply(2, 'gpt-6-sol', usage(100, 10, 2))]));
  writeFileSync(join(otherDir, 'x.jsonl'), jsonl([{ ...header('x'), cwd: '/work/other' }, reply(2, 'grok-4.7', usage(100, 10, 10), 'xai')]));
  const childPath = join(childDir(join(root, 'prjct', 'subagents', 'state'), 'old'), 'j_1');
  mkdirSync(childPath, { recursive: true });
  writeFileSync(join(childPath, 'c.jsonl'), jsonl([{ ...header('kid'), cwd: '/tmp' }, reply(3, 'gpt-6-luna', usage(10, 1, 0.5))]));
  const current = join(projectDir, 'now.jsonl');
  const entries = [user(5, 'hello'), reply(6, 'gpt-6-sol', usage(10, 1, 1))];
  const notes: string[] = [];
  const ctx = {
    hasUI: false, mode: 'print', cwd: '/work/app',
    ui: { notify: (text: string) => notes.push(text) },
    sessionManager: {
      getSessionDir: () => projectDir, getSessionFile: () => current, getSessionId: () => 'now',
      getHeader: () => header('now', 5), getEntries: () => entries,
    },
  };
  const { pi, commands } = recordingPi();
  piUsage(pi);
  await commands.get('usage').handler('', ctx);
  const text = notes.join('\n');
  assert.match(text, /session \$1\.00 · project \$3\.50 · all \$13\.50/);
  assert.match(text, /OPS-7 · Fix OPS-7 · \$2\.50/);
  assert.match(text, /\$10\.00 {2}grok-4\.7 · xai/);

  // --no-session: no session folder, no file; the project is still found from the working directory.
  notes.length = 0;
  const ephemeral = { ...ctx, sessionManager: { ...ctx.sessionManager, getSessionDir: () => '', getSessionFile: () => undefined } };
  const fresh = recordingPi();
  piUsage(fresh.pi);
  await fresh.commands.get('usage').handler('', ephemeral);
  assert.match(notes.join('\n'), /session \$1\.00 · project \$3\.50/);
});
