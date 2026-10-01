/**
 * List prices for the tokens Pi recorded at $0, from the OpenRouter catalog.
 * Ported from prjct-cli's model-pricing.ts, plus cache read/write rates.
 * Disk cache with a 24h TTL; a failed fetch keeps the last good catalog.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number };

/** USD per token. A cache rate the catalog does not list stays undefined: those tokens remain unpriced. */
export type Rate = { id: string; input: number; output: number; cacheRead?: number; cacheWrite?: number };

export type Catalog = { fetchedAt: number; rates: Rate[] };

export const CATALOG_URL = 'https://openrouter.ai/api/v1/models';
export const CATALOG_TTL = 24 * 60 * 60 * 1000;
const FETCH_MS = 8_000;

const dash = (id: string): string => id.toLowerCase().replace(/[_.]/g, '-');
const tail = (id: string): string => {
  const name = dash(id);
  return name.slice(name.lastIndexOf('/') + 1);
};
const price = (value: unknown): number | undefined => {
  const n = Number(value);
  return value !== undefined && value !== null && value !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Rates from the OpenRouter models payload. Variants (`:free`, `:batch`) and `~` aliases are left out. */
export function parseCatalog(payload: unknown): Rate[] {
  const rows = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return [];
  const rates: Rate[] = [];
  for (const row of rows) {
    const id = typeof row?.id === 'string' ? row.id : '';
    if (!id || id.includes(':') || id.startsWith('~')) continue;
    const input = price(row.pricing?.prompt);
    const output = price(row.pricing?.completion);
    if (input === undefined || output === undefined) continue;
    const cacheRead = price(row.pricing?.input_cache_read);
    const cacheWrite = price(row.pricing?.input_cache_write);
    rates.push({ id, input, output, ...(cacheRead !== undefined ? { cacheRead } : {}), ...(cacheWrite !== undefined ? { cacheWrite } : {}) });
  }
  // Longest name first, so `gpt-6-sol-pro` wins over `gpt-6-sol`.
  return rates.sort((a, b) => tail(b.id).length - tail(a.id).length);
}

/**
 * The catalog rate for a Pi model. Matches on the name after the last slash;
 * a dated or suffixed id (`k3-256k`) matches its base. The provider's first
 * word is tried as a vendor prefix too: kimi-coding/k3 → kimi-k3.
 */
export function rateFor(rates: readonly Rate[], provider: string, model: string): Rate | undefined {
  const name = tail(model);
  const vendor = dash(provider).split('-')[0];
  const needles = vendor && !name.startsWith(`${vendor}-`) ? [name, `${vendor}-${name}`] : [name];
  for (const needle of needles) {
    for (const rate of rates) {
      const key = tail(rate.id);
      if (needle === key || needle.startsWith(`${key}-`)) return rate;
    }
  }
  return undefined;
}

/** Free models and local runtimes cost nothing at list price either. */
export const isFree = (provider: string, model: string): boolean =>
  /:free$/.test(model) || model === 'openrouter/free' || model === 'free' || ['ollama', 'lmstudio', 'llama-cpp', 'llamacpp'].includes(provider);

/** List price of tokens at a catalog rate; cache tokens without a listed rate stay unpriced. */
export function estimate(tokens: Tokens, rate: Rate): { usd: number; unpriced: number } {
  let usd = tokens.input * rate.input + tokens.output * rate.output;
  let unpriced = 0;
  if (tokens.cacheRead) rate.cacheRead !== undefined ? usd += tokens.cacheRead * rate.cacheRead : unpriced += tokens.cacheRead;
  if (tokens.cacheWrite) rate.cacheWrite !== undefined ? usd += tokens.cacheWrite * rate.cacheWrite : unpriced += tokens.cacheWrite;
  return { usd, unpriced };
}

type Fetch = (url: string) => Promise<unknown>;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`pricing catalog HTTP ${response.status}`);
  return response.json();
}

/** The catalog in memory, backed by a disk cache. Never throws: no catalog means no estimates. */
export class Pricing {
  rates: Rate[] = [];
  fetchedAt = 0;
  private loading?: Promise<boolean>;

  constructor(private readonly file: string, private readonly fetcher: Fetch = fetchJson, private readonly now = Date.now) {}

  get fresh(): boolean { return this.rates.length > 0 && this.now() - this.fetchedAt < CATALOG_TTL; }

  /** Loads from disk, then from the network when stale or forced. Resolves true when the rates changed. */
  load(force = false): Promise<boolean> {
    this.loading ??= this.fill(force).finally(() => { this.loading = undefined; });
    return this.loading;
  }

  private async fill(force: boolean): Promise<boolean> {
    if (this.fresh && !force) return false;
    let changed = false;
    if (!this.rates.length) {
      const disk = await readFile(this.file, 'utf8').then(text => JSON.parse(text) as Catalog).catch(() => undefined);
      if (disk?.rates?.length) { this.rates = disk.rates; this.fetchedAt = disk.fetchedAt; changed = true; }
      if (this.fresh && !force) return changed;
    }
    try {
      const rates = parseCatalog(await this.fetcher(CATALOG_URL));
      if (!rates.length) return changed;
      this.rates = rates;
      this.fetchedAt = this.now();
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(`${this.file}.tmp`, JSON.stringify({ fetchedAt: this.fetchedAt, rates } satisfies Catalog));
      await rename(`${this.file}.tmp`, this.file);
      return true;
    } catch {
      return changed;
    }
  }
}
