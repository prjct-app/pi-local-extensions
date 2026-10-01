/**
 * Totals and the words for them. The subsidy is what the same use would cost
 * at API list price: what Pi recorded, plus a catalog estimate for the tokens
 * Pi recorded at $0. Tokens with no price anywhere are counted, never guessed.
 */
import { basename, dirname } from 'node:path';
import { estimate, isFree, rateFor, type Rate, type Tokens } from './pricing.ts';
import { addTokens, childDir, emptyTokens, tokenSum, type FileUsage, type Row } from './scan.ts';

export type Total = {
  tokens: Tokens;
  /** Calls per kind label: replies, cache warms, compactions, subagent calls. */
  calls: Record<string, number>;
  /** List price Pi recorded. */
  recorded: number;
  /** List price from the catalog, for tokens Pi recorded at $0. */
  estimated: number;
  /** Tokens no price covers. */
  unpriced: number;
};

export type ModelTotal = Total & { provider: string; model: string };

export type Summary = {
  total: Total;
  /** Highest subsidy first. */
  models: ModelTotal[];
  kinds: { label: string; total: Total }[];
};

export const emptyTotal = (): Total => ({ tokens: emptyTokens(), calls: {}, recorded: 0, estimated: 0, unpriced: 0 });
export const subsidyOf = (total: Total): number => total.recorded + total.estimated;
export const callCount = (total: Total): number => Object.values(total.calls).reduce((sum, n) => sum + n, 0);

const KIND_LABELS: Record<string, string> = {
  reply: 'replies',
  cache_warm: 'cache warms',
  compaction: 'compactions',
  branch_summary: 'branch summaries',
};
const SUBAGENTS = 'subagent calls';
const kindLabel = (row: Row, child: boolean): string => (child ? SUBAGENTS : KIND_LABELS[row.kind] ?? row.kind.replace(/_/g, ' '));

const rateCache = new WeakMap<readonly Rate[], Map<string, Rate | undefined>>();
function cachedRate(rates: readonly Rate[], provider: string, model: string): Rate | undefined {
  let cache = rateCache.get(rates);
  if (!cache) rateCache.set(rates, cache = new Map());
  const key = `${provider}\u0001${model}`;
  if (!cache.has(key)) cache.set(key, rateFor(rates, provider, model));
  return cache.get(key);
}

/** One row at list price: what Pi recorded, plus the catalog for its $0 tokens. */
export function priceRow(row: Row, rates: readonly Rate[]): { recorded: number; estimated: number; unpriced: number } {
  const zero = tokenSum(row.zero);
  if (!zero || isFree(row.provider, row.model)) return { recorded: row.usd, estimated: 0, unpriced: 0 };
  const rate = cachedRate(rates, row.provider, row.model);
  if (!rate) return { recorded: row.usd, estimated: 0, unpriced: zero };
  const { usd, unpriced } = estimate(row.zero, rate);
  return { recorded: row.usd, estimated: usd, unpriced };
}

function fold(into: Total, row: Row, price: ReturnType<typeof priceRow>, label: string): void {
  addTokens(into.tokens, row.tokens);
  into.calls[label] = (into.calls[label] ?? 0) + row.calls;
  into.recorded += price.recorded;
  into.estimated += price.estimated;
  into.unpriced += price.unpriced;
}

/** Totals for a set of session files; `children` are subagent runs. */
export function summarize(mains: readonly FileUsage[], children: readonly FileUsage[], rates: readonly Rate[]): Summary {
  const total = emptyTotal();
  const models = new Map<string, ModelTotal>();
  const kinds = new Map<string, Total>();
  const take = (file: FileUsage, child: boolean): void => {
    for (const row of Object.values(file.rows)) {
      const price = priceRow(row, rates);
      const label = kindLabel(row, child);
      fold(total, row, price, label);
      const key = `${row.provider}\u0001${row.model}`;
      const model = models.get(key) ?? { ...emptyTotal(), provider: row.provider, model: row.model };
      models.set(key, model);
      fold(model, row, price, label);
      const kind = kinds.get(label) ?? emptyTotal();
      kinds.set(label, kind);
      fold(kind, row, price, label);
    }
  };
  for (const file of mains) take(file, false);
  for (const file of children) take(file, true);
  const bySubsidy = (a: Total, b: Total) => subsidyOf(b) - subsidyOf(a) || tokenSum(b.tokens) - tokenSum(a.tokens);
  return {
    total,
    models: [...models.values()].sort(bySubsidy),
    kinds: [...kinds.entries()].map(([label, kindTotal]) => ({ label, total: kindTotal })).sort((a, b) => bySubsidy(a.total, b.total)),
  };
}

// ---------------------------------------------------------------------------
// Subagent trees

/**
 * The main session each subagent run belongs to. A child lives at
 * state/<sha256(parent id)>/<job>/<file>.jsonl; a grandchild's parent is a child.
 */
export function ownersOf(mains: readonly FileUsage[], children: readonly FileUsage[], stateRoot: string): Map<string, FileUsage[]> {
  const byDir = new Map<string, FileUsage>();
  for (const file of [...mains, ...children]) if (file.id) byDir.set(childDir(stateRoot, file.id), file);
  const parentOf = (child: FileUsage): FileUsage | undefined => byDir.get(dirname(dirname(child.path)));
  const mainPaths = new Set(mains.map(file => file.path));
  const owners = new Map<string, FileUsage[]>();
  for (const child of children) {
    let node: FileUsage | undefined = child;
    for (let depth = 0; node && !mainPaths.has(node.path) && depth < 16; depth++) node = parentOf(node);
    if (!node || !mainPaths.has(node.path)) continue;
    const list = owners.get(node.path) ?? [];
    owners.set(node.path, list);
    list.push(child);
  }
  return owners;
}

// ---------------------------------------------------------------------------
// Words

export function usd(amount: number): string {
  if (amount > 0 && amount < 0.01) return '<$0.01';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function compact(n: number): string {
  const units: [number, string][] = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [size, unit] of units) {
    if (n >= size) {
      const value = n / size;
      return `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')}${unit}`;
    }
  }
  return String(Math.round(n));
}

export const plural = (n: number, word: string): string => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

export const tokensLine = (t: Tokens): string =>
  `${compact(tokenSum(t))} · in ${compact(t.input)} · out ${compact(t.output)} · cache read ${compact(t.cacheRead)} · cache write ${compact(t.cacheWrite)}`;

export const callsLine = (total: Total): string =>
  Object.entries(total.calls).sort((a, b) => b[1] - a[1]).map(([label, n]) => `${n.toLocaleString('en-US')} ${label}`).join(' · ') || 'none';

export function pricedLine(total: Total): string {
  const parts = [`${usd(total.recorded)} recorded by Pi`];
  if (total.estimated) parts.push(`${usd(total.estimated)} from OpenRouter list prices`);
  if (total.unpriced) parts.push(`${compact(total.unpriced)} tokens with no price`);
  return parts.join(' · ');
}

/** "$2,333.38  gpt-5.6-sol · openai-codex · 2.8B tok", aligned on the amount. */
export function modelLines(models: readonly ModelTotal[], limit = 40): string[] {
  const shown = models.slice(0, limit);
  const amounts = shown.map(model => (subsidyOf(model) || !model.unpriced ? usd(subsidyOf(model)) : '—'));
  const width = Math.max(0, ...amounts.map(amount => amount.length));
  const lines = shown.map((model, index) => {
    const notes = [`${compact(tokenSum(model.tokens))} tok`];
    if (model.estimated) notes.push('list estimate');
    if (model.unpriced) notes.push(`${compact(model.unpriced)} unpriced`);
    return `${amounts[index]!.padStart(width)}  ${model.model} · ${model.provider} · ${notes.join(' · ')}`;
  });
  if (models.length > limit) lines.push(`… ${plural(models.length - limit, 'more model')}`);
  return lines;
}

export function kindLines(kinds: Summary['kinds']): string[] {
  const amounts = kinds.map(kind => usd(subsidyOf(kind.total)));
  const width = Math.max(0, ...amounts.map(amount => amount.length));
  return kinds.map((kind, index) => `${amounts[index]!.padStart(width)}  ${kind.label} · ${plural(callCount(kind.total), 'call')}`);
}

/** What a session is called in the list: its /name, its ticket, or how its first prompt starts. */
export function labelOf(file: FileUsage): string {
  if (file.name) return file.name;
  const ticket = file.tickets[0];
  if (ticket) return file.prompt ? `${ticket} · ${file.prompt}` : ticket;
  return file.prompt ?? file.id ?? basename(file.path, '.jsonl');
}

/** Sessions that share a ticket, with their combined subsidy. Biggest first. */
export function ticketGroups(sessions: readonly { file: FileUsage; usd: number }[]): { ticket: string; sessions: number; usd: number }[] {
  const groups = new Map<string, { ticket: string; sessions: number; usd: number }>();
  for (const { file, usd: amount } of sessions) {
    const ticket = file.tickets[0];
    if (!ticket) continue;
    const group = groups.get(ticket) ?? { ticket, sessions: 0, usd: 0 };
    groups.set(ticket, group);
    group.sessions += 1;
    group.usd += amount;
  }
  return [...groups.values()].sort((a, b) => b.usd - a.usd);
}

