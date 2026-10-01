/**
 * Reads what Pi already wrote: every session .jsonl carries `usage` with the
 * tokens and the list-price cost of each reply. Nothing here writes to a
 * session; the only file written is this extension's own cache.
 *
 * Session files are append-only, so a file that grew is read from where the
 * last scan stopped. A fork copies its parent's entries with their original
 * timestamps; entries older than the fork's header are not counted again.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Tokens } from './pricing.ts';

/** One kind of call to one model: replies, cache warms, compactions. */
export type Row = {
  kind: string;
  provider: string;
  model: string;
  calls: number;
  tokens: Tokens;
  /** List-price cost Pi recorded. */
  usd: number;
  /** Tokens Pi recorded at $0, priced later from the catalog. */
  zero: Tokens;
};

export type FileUsage = {
  path: string;
  size: number;
  mtimeMs: number;
  /** Byte after the last complete line read. */
  offset: number;
  /** Start of the file, to notice a rewrite. */
  head: string;
  id?: string;
  cwd?: string;
  parentSession?: string;
  startedAt?: number;
  lastAt?: number;
  /** The /name of the session. */
  name?: string;
  /** Start of the first prompt. */
  prompt?: string;
  tickets: string[];
  /** User messages looked at for the prompt and tickets. */
  users: number;
  /** Last model seen, for compactions, which do not name theirs. */
  provider?: string;
  model?: string;
  rows: Record<string, Row>;
};

/** Bump when what a scan extracts changes, so cached files are read again. */
const CACHE_VERSION = 2;
const HEAD_BYTES = 256;
/** Prompts and tickets come from the first few user messages; later ones are skipped unread. */
const USER_SCAN = 4;
const SKIP = new Set(['custom', 'custom_message', 'label', 'thinking_level_change', 'context_edit']);

export const emptyTokens = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
export const tokenSum = (t: Tokens): number => t.input + t.output + t.cacheRead + t.cacheWrite;
export const addTokens = (into: Tokens, from: Tokens): void => {
  into.input += from.input; into.output += from.output; into.cacheRead += from.cacheRead; into.cacheWrite += from.cacheWrite;
};

export const emptyFile = (path: string): FileUsage => ({ path, size: 0, mtimeMs: 0, offset: 0, head: '', tickets: [], users: 0, rows: {} });

/** Where pi-subagents keeps the child sessions a session launched (pi-subagents/src/storage.ts sessionRoot). */
export const childDir = (stateRoot: string, sessionId: string): string =>
  join(stateRoot, createHash('sha256').update(sessionId).digest('hex').slice(0, 24));

// ---------------------------------------------------------------------------
// Tickets

/** PROJ-123: two letters first, and not a piece of a UUID or a longer dashed word. */
const JIRA = /(?<![\w-])([A-Z]{2}[A-Z0-9_]{0,8}-\d{1,6})(?![\w-])/g;
const NOT_TICKETS = new Set(['UTF', 'ISO', 'SHA', 'GPT', 'RFC', 'ES', 'MD', 'AES', 'RSA', 'HTTP', 'TLS', 'SSL', 'IPV', 'CVE', 'WCAG', 'ECMA', 'PEP', 'COVID', 'MP', 'H', 'TS', 'X', 'K', 'V', 'BASE', 'ARM', 'TOP', 'GPU', 'CPU', 'P', 'M', 'IP', 'UUID', 'LTS', 'NODE', 'ED', 'HMAC', 'PBKDF']);
const LINKS: { pattern: RegExp; ref: (m: RegExpMatchArray) => string }[] = [
  { pattern: /https?:\/\/[\w.-]+\.atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/g, ref: m => m[1]! },
  { pattern: /https?:\/\/[\w.-]+\.atlassian\.net\/wiki\/\S*?\/pages\/(\d+)/g, ref: m => `confluence:${m[1]}` },
  { pattern: /https?:\/\/linear\.app\/[\w-]+\/issue\/([A-Z][A-Z0-9]+-\d+)/g, ref: m => m[1]! },
  { pattern: /https?:\/\/app\.clickup\.com\/t\/(?:\d+\/)?([\w-]+)/g, ref: m => `clickup:${m[1]}` },
  { pattern: /https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:issues|pull)\/(\d+)/g, ref: m => `${m[1]}#${m[2]}` },
  { pattern: /https?:\/\/docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([\w-]{8})[\w-]*/g, ref: m => `gdoc:${m[1]}` },
  { pattern: /https?:\/\/(?:www\.)?notion\.(?:so|site)\/(?:[\w-]+\/)?([\w-]*?)-?([0-9a-f]{32})/g, ref: m => `notion:${m[1] || m[2]!.slice(0, 8)}` },
];

/** Ticket references in a prompt: links first (they are certain), then bare Jira keys. */
export function ticketsIn(text: string): string[] {
  const found: string[] = [];
  const add = (ref: string): void => { if (!found.includes(ref)) found.push(ref); };
  for (const { pattern, ref } of LINKS) for (const match of text.matchAll(pattern)) add(ref(match));
  for (const match of text.matchAll(JIRA)) {
    const key = match[1]!;
    if (!NOT_TICKETS.has(key.slice(0, key.indexOf('-')))) add(key);
  }
  return found;
}

const textOf = (content: unknown): string =>
  typeof content === 'string' ? content
    : Array.isArray(content) ? content.map(part => (part && typeof part === 'object' && typeof part.text === 'string' ? part.text : '')).join('\n')
      : '';

const snippet = (text: string): string | undefined => {
  const line = text.split('\n').map(part => part.trim()).find(Boolean);
  return line ? (line.length > 120 ? `${line.slice(0, 119)}…` : line) : undefined;
};

// ---------------------------------------------------------------------------
// Entries

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

function add(file: FileUsage, kind: string, provider: string, model: string, usage: any): void {
  const tokens: Tokens = { input: num(usage?.input), output: num(usage?.output), cacheRead: num(usage?.cacheRead), cacheWrite: num(usage?.cacheWrite) };
  const cost = num(usage?.cost?.total);
  if (!cost && !tokenSum(tokens)) return;
  const key = `${kind}\u0001${provider}\u0001${model}`;
  const row = file.rows[key] ??= { kind, provider, model, calls: 0, tokens: emptyTokens(), usd: 0, zero: emptyTokens() };
  row.calls += 1;
  addTokens(row.tokens, tokens);
  if (cost) row.usd += cost;
  else addTokens(row.zero, tokens);
}

/** Folds one session entry into the file's totals. Shared by the file scan and the live session. */
export function absorb(file: FileUsage, entry: any): void {
  if (!entry || typeof entry !== 'object') return;
  const at = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : Number.NaN;
  if (entry.type === 'session') {
    file.id = entry.id;
    file.cwd = entry.cwd;
    if (entry.parentSession) file.parentSession = entry.parentSession;
    if (Number.isFinite(at)) file.startedAt = at;
    return;
  }
  if (Number.isFinite(at) && (file.lastAt === undefined || at > file.lastAt)) file.lastAt = at;
  // A fork's copied entries keep their original time; the parent already counted them.
  const copied = !!file.parentSession && file.startedAt !== undefined && Number.isFinite(at) && at < file.startedAt;
  switch (entry.type) {
    case 'model_change':
      file.provider = entry.provider; file.model = entry.modelId;
      return;
    case 'session_info':
      if (typeof entry.name === 'string' && entry.name.trim()) file.name = entry.name.trim();
      return;
    case 'usage':
      if (!copied) add(file, typeof entry.kind === 'string' && entry.kind ? entry.kind : 'usage', String(entry.provider ?? 'unknown'), String(entry.model ?? 'unknown'), entry.usage);
      return;
    case 'compaction':
    case 'branch_summary':
      if (entry.usage && !copied) add(file, entry.type, file.provider ?? 'unknown', file.model ?? 'unknown', entry.usage);
      return;
    case 'message': {
      const message = entry.message;
      if (message?.role === 'assistant') {
        if (message.provider) file.provider = message.provider;
        if (message.model) file.model = message.model;
        if (message.usage && !copied) add(file, 'reply', String(message.provider ?? 'unknown'), String(message.model ?? 'unknown'), message.usage);
      } else if (message?.role === 'user' && file.users < USER_SCAN) {
        file.users += 1;
        const text = textOf(message.content);
        file.prompt ??= snippet(text);
        for (const ticket of ticketsIn(text)) if (!file.tickets.includes(ticket)) file.tickets.push(ticket);
      }
    }
  }
}

/** Whether a line is worth parsing, decided from its first bytes: tool results and system prompts are most of a file. */
function wanted(head: string, file: FileUsage): boolean {
  const type = /^\{"type":"([a-z_]+)"/.exec(head)?.[1];
  if (!type) return true;
  if (SKIP.has(type)) return false;
  if (type !== 'message') return true;
  const role = /"message":\{"role":"(\w+)"/.exec(head)?.[1];
  if (!role) return true;
  return role === 'assistant' || (role === 'user' && file.users < USER_SCAN);
}

/** Reads complete lines from `start`; a trailing line still being written is left for next time. */
async function readLines(path: string, start: number, onLine: (line: Buffer) => void): Promise<number> {
  let offset = start;
  let pending: Buffer[] = [];
  for await (const chunk of createReadStream(path, { start, highWaterMark: 1 << 20 }) as AsyncIterable<Buffer>) {
    let from = 0;
    for (let nl = chunk.indexOf(10, from); nl >= 0; nl = chunk.indexOf(10, from)) {
      const piece = chunk.subarray(from, nl);
      const line = pending.length ? Buffer.concat([...pending, piece]) : piece;
      pending = [];
      offset += line.length + 1;
      from = nl + 1;
      if (line.length) onLine(line);
    }
    if (from < chunk.length) pending.push(chunk.subarray(from));
  }
  return offset;
}

async function readHead(path: string): Promise<string> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
    return buffer.toString('latin1', 0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Reads a session file into totals, continuing from `previous` when the file only grew. */
export async function scanFile(path: string, previous?: FileUsage): Promise<FileUsage | undefined> {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) return undefined;
  if (previous && previous.size === info.size && previous.mtimeMs === info.mtimeMs) return previous;
  const head = await readHead(path).catch(() => '');
  const resume = previous && info.size >= previous.offset && previous.head === head.slice(0, previous.head.length) && previous.head.length > 0;
  const file: FileUsage = resume ? structuredClone(previous) : { ...emptyFile(path), head };
  if (!resume || file.head.length < head.length) file.head = head;
  file.offset = await readLines(path, file.offset, line => {
    if (!wanted(line.toString('latin1', 0, Math.min(line.length, 300)), file)) return;
    try { absorb(file, JSON.parse(line.toString('utf8'))); } catch { /* a torn or foreign line */ }
  });
  file.size = info.size;
  file.mtimeMs = info.mtimeMs;
  return file;
}

// ---------------------------------------------------------------------------
// Where the files are

export const jsonlIn = async (dir: string): Promise<string[]> =>
  (await readdir(dir).catch(() => [] as string[])).filter(name => name.endsWith('.jsonl')).map(name => join(dir, name));

const subdirs = async (dir: string): Promise<string[]> =>
  (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter(entry => entry.isDirectory()).map(entry => join(dir, entry.name));

/** Every session file Pi keeps, one folder per working directory. */
export async function allSessionFiles(root: string): Promise<string[]> {
  return (await Promise.all((await subdirs(root)).map(jsonlIn))).flat();
}

/** Every child session pi-subagents kept: state/<parent hash>/<job>/*.jsonl. */
export async function allChildFiles(stateRoot: string): Promise<string[]> {
  const jobs = (await Promise.all((await subdirs(stateRoot)).map(subdirs))).flat();
  return (await Promise.all(jobs.map(jsonlIn))).flat();
}

/** The child sessions one session launched directly. */
export async function childFiles(stateRoot: string, sessionId: string): Promise<string[]> {
  return (await Promise.all((await subdirs(childDir(stateRoot, sessionId))).map(jsonlIn))).flat();
}

// ---------------------------------------------------------------------------
// Cache

/** Every file read so far, kept on disk so the next /usage only reads what changed. */
export class Scanner {
  files = new Map<string, FileUsage>();
  private loaded = false;
  private dirty = false;

  constructor(private readonly cacheFile: string) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const saved = await readFile(this.cacheFile, 'utf8').then(text => JSON.parse(text)).catch(() => undefined);
    if (saved?.version !== CACHE_VERSION || !Array.isArray(saved.files)) return;
    for (const file of saved.files as FileUsage[]) if (file?.path) this.files.set(file.path, file);
  }

  /** Reads one file if it changed. Returns its totals, or undefined when it is gone. */
  async scan(path: string): Promise<FileUsage | undefined> {
    const previous = this.files.get(path);
    const file = await scanFile(path, previous).catch(() => previous);
    if (!file) { if (this.files.delete(path)) this.dirty = true; return undefined; }
    if (file !== previous) { this.files.set(path, file); this.dirty = true; }
    return file;
  }

  /** Forgets cached files under `dir` that are no longer there. */
  prune(dir: string, present: ReadonlySet<string>): void {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    for (const path of this.files.keys()) {
      if (path.startsWith(prefix) && !present.has(path)) { this.files.delete(path); this.dirty = true; }
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    await mkdir(dirname(this.cacheFile), { recursive: true });
    const temp = `${this.cacheFile}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify({ version: CACHE_VERSION, files: [...this.files.values()] }));
    await rename(temp, this.cacheFile);
  }
}
