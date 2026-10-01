/**
 * pi-usage: tokens and the subsidy (API list-price value) of this session, this
 * project and every project, in the shared docked panel.
 *
 * It never reaches the model: no tools, no messages, no prompt hooks, nothing
 * written to the session. It reads the session files Pi already writes and
 * keeps its own cache in ~/.prjct/pi-usage.
 */
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { SYMBOL, ago, brand, completer, openPanel, panelText, type CommandOption, type PanelDetail, type PanelField, type PanelItem, type PanelSpec } from '@prjct.app/pi-tui-kit';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { Pricing, isFree } from './pricing.ts';
import {
  callsLine, compact, kindLines, labelOf, modelLines, ownersOf, plural, pricedLine, subsidyOf, summarize, ticketGroups, tokensLine, usd,
  type Summary,
} from './report.ts';
import { Scanner, absorb, allChildFiles, allSessionFiles, childFiles, emptyFile, jsonlIn, tokenSum, type FileUsage } from './scan.ts';

const SCOPES = ['session', 'project', 'global'] as const;
type Scope = typeof SCOPES[number];

const prjctHome = (): string => resolve(process.env.PRJCT_HOME ?? join(homedir(), '.prjct'));
const agentDir = (): string => resolve(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent'));
/** Pi's folder for a working directory's sessions (session-manager getDefaultSessionDirPath). */
const defaultSessionDir = (cwd: string): string =>
  join(agentDir(), 'sessions', `--${resolve(cwd).replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`);

type Where = {
  sessionsRoot: string;
  projectDir: string;
  stateRoot: string;
  currentFile?: string;
  cwd: string;
};

type Tree = { file: FileUsage; children: FileUsage[]; summary: Summary };

type View = {
  session: Tree;
  project: { trees: Tree[]; summary: Summary };
  global?: { summary: Summary; mains: number; children: number; projects: { cwd: string; usd: number; sessions: number }[] };
};

const options: CommandOption[] = [
  { value: 'session', description: 'open on this session' },
  { value: 'project', description: 'open on every session in this folder' },
  { value: 'global', description: 'open on every project' },
];

export default function piUsage(pi: ExtensionAPI): void {
  const home = prjctHome();
  const scanner = new Scanner(join(home, 'pi-usage', 'scan.json'));
  const pricing = new Pricing(join(home, 'pi-usage', 'pricing.json'));
  const listeners = new Set<() => void>();
  const state: {
    where?: Where;
    live?: FileUsage;
    mains: FileUsage[];
    children: FileUsage[];
    globalMains?: FileUsage[];
    globalChildren?: FileUsage[];
    view?: View;
    scanning?: string;
    running?: Promise<void>;
  } = { mains: [], children: [] };

  const changed = (): void => { for (const listener of listeners) listener(); };

  const locate = (ctx: ExtensionContext): Where => ({
    sessionsRoot: join(agentDir(), 'sessions'),
    // An in-memory session (--no-session) has no folder; the project's sessions are still in Pi's default one.
    projectDir: ctx.sessionManager.getSessionDir() || defaultSessionDir(ctx.cwd),
    stateRoot: join(home, 'subagents', 'state'),
    currentFile: ctx.sessionManager.getSessionFile(),
    cwd: ctx.cwd,
  });

  /** This session straight from memory: the file may not be written yet. */
  const liveFile = (ctx: ExtensionContext): FileUsage => {
    const file = emptyFile(ctx.sessionManager.getSessionFile() ?? `live:${ctx.sessionManager.getSessionId()}`);
    absorb(file, ctx.sessionManager.getHeader());
    for (const entry of ctx.sessionManager.getEntries()) absorb(file, entry);
    return file;
  };

  const rebuild = (): void => {
    const where = state.where;
    const live = state.live;
    if (!where || !live) return;
    const rates = pricing.rates;
    const mains = [live, ...state.mains];
    const owners = ownersOf(mains, state.children, where.stateRoot);
    const tree = (file: FileUsage): Tree => {
      const children = owners.get(file.path) ?? [];
      return { file, children, summary: summarize([file], children, rates) };
    };
    const session = tree(live);
    const trees = state.mains.map(tree).filter(t => tokenSum(t.summary.total.tokens) > 0 || t.file.prompt || t.file.name)
      .sort((a, b) => (b.file.lastAt ?? 0) - (a.file.lastAt ?? 0));
    const project = { trees, summary: summarize(mains, [...owners.values()].flat(), rates) };
    let global: View['global'];
    if (state.globalMains && state.globalChildren) {
      const all = [live, ...state.globalMains];
      const globalOwners = ownersOf(all, state.globalChildren, where.stateRoot);
      const projects = new Map<string, { cwd: string; usd: number; sessions: number }>();
      for (const file of all) {
        const cwd = file.cwd ?? '(unknown folder)';
        const entry = projects.get(cwd) ?? { cwd, usd: 0, sessions: 0 };
        projects.set(cwd, entry);
        entry.sessions += 1;
        entry.usd += subsidyOf(summarize([file], globalOwners.get(file.path) ?? [], rates).total);
      }
      global = {
        summary: summarize(all, state.globalChildren, rates),
        mains: all.length,
        children: state.globalChildren.length,
        projects: [...projects.values()].sort((a, b) => b.usd - a.usd),
      };
    }
    state.view = { session, project, global };
  };

  const progress = (text: string | undefined): void => { state.scanning = text; rebuild(); changed(); };

  /** Reads what changed: this folder and its subagent runs first, then every project, then prices. */
  const collect = async (force: boolean): Promise<void> => {
    const where = state.where!;
    await scanner.load();
    progress('reading this project…');
    const skip = (path: string) => path !== where.currentFile;
    const projectPaths = (await jsonlIn(where.projectDir)).filter(skip);
    const mains: FileUsage[] = [];
    for (const path of projectPaths) { const file = await scanner.scan(path); if (file) mains.push(file); }
    scanner.prune(where.projectDir, new Set(projectPaths));
    // Subagent runs, launched by these sessions or by their own subagents.
    const children: FileUsage[] = [];
    const queue = [state.live?.id, ...mains.map(file => file.id)].filter((id): id is string => !!id);
    const seen = new Set<string>();
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const path of await childFiles(where.stateRoot, id)) {
        const file = await scanner.scan(path);
        if (!file) continue;
        children.push(file);
        if (file.id) queue.push(file.id);
      }
    }
    state.mains = mains;
    state.children = children;
    progress('reading all projects…');

    const globalPaths = (await allSessionFiles(where.sessionsRoot)).filter(skip);
    const childPaths = await allChildFiles(where.stateRoot);
    const globalMains: FileUsage[] = [];
    const globalChildren: FileUsage[] = [];
    const total = globalPaths.length + childPaths.length;
    let done = 0;
    let shown = Date.now();
    for (const [paths, into] of [[globalPaths, globalMains], [childPaths, globalChildren]] as const) {
      for (const path of paths) {
        const file = await scanner.scan(path);
        if (file) into.push(file);
        done += 1;
        if (Date.now() - shown > 250) { shown = Date.now(); progress(`reading all projects ${done}/${total}…`); }
      }
    }
    scanner.prune(where.sessionsRoot, new Set([...globalPaths, ...(where.currentFile ? [where.currentFile] : [])]));
    scanner.prune(where.stateRoot, new Set(childPaths));
    await scanner.save().catch(() => undefined);
    state.globalMains = globalMains;
    state.globalChildren = globalChildren;

    // Prices only matter when some tokens were recorded at $0.
    const needsPrices = [state.live!, ...globalMains, ...globalChildren].some(file =>
      Object.values(file.rows).some(row => tokenSum(row.zero) > 0 && !isFree(row.provider, row.model)));
    if (needsPrices && (force || !pricing.fresh)) {
      progress('fetching list prices…');
      await pricing.load(force);
    }
    progress(undefined);
  };

  const refresh = (ctx: ExtensionContext, force = false): Promise<void> => {
    state.where = locate(ctx);
    state.live = liveFile(ctx);
    rebuild();
    state.running ??= collect(force)
      .catch(error => progress(`could not read everything: ${error instanceof Error ? error.message : String(error)}`))
      .finally(() => { state.running = undefined; });
    return state.running;
  };

  const scopeMeta = (summary: Summary | undefined): string =>
    summary ? `${usd(subsidyOf(summary.total))} · ${compact(tokenSum(summary.total.tokens))} tok` : state.scanning ?? 'reading…';

  const items = (): PanelItem[] => {
    const view = state.view;
    if (!view) return [];
    const rows: PanelItem[] = [
      { id: 'session', label: 'This session', symbol: SYMBOL.active, tone: 'success', meta: scopeMeta(view.session.summary) },
      { id: 'project', label: 'Project', meta: `${scopeMeta(view.project.summary)} · ${plural(view.project.trees.length + 1, 'session')}`, search: state.where?.cwd },
      { id: 'global', label: 'All projects', meta: scopeMeta(view.global?.summary) },
    ];
    for (const tree of view.project.trees) {
      rows.push({
        id: `file:${tree.file.path}`,
        label: `  ${labelOf(tree.file)}`,
        meta: `${usd(subsidyOf(tree.summary.total))} · ${ago(tree.file.lastAt)}`,
        search: [...tree.file.tickets, tree.file.prompt ?? '', tree.file.id ?? ''].join(' '),
      });
    }
    return rows;
  };

  const scopeFields = (summary: Summary): PanelField[] => [
    { label: 'subsidy', value: `${usd(subsidyOf(summary.total))} at API list price`, tone: 'accent' },
    { label: 'tokens', value: tokensLine(summary.total.tokens) },
    { label: 'calls', value: callsLine(summary.total) },
    { label: 'priced', value: pricedLine(summary.total), tone: summary.total.unpriced ? 'warning' : undefined },
  ];

  const modelSection = (summary: Summary) => ({ title: 'By model · subsidy', lines: summary.models.length ? modelLines(summary.models) : ['No calls yet.'] });

  const detail = (item: PanelItem): PanelDetail => {
    const view = state.view;
    if (!view) return { title: item.label };
    const subtitle = state.scanning;
    if (item.id === 'session') {
      const { file, children, summary } = view.session;
      return {
        title: 'This session',
        subtitle: subtitle ?? labelOf(file),
        fields: [
          ...scopeFields(summary),
          { label: 'subagents', value: children.length ? plural(children.length, 'run') : 'none' },
          { label: 'tickets', value: file.tickets.join(' · ') || '—' },
        ],
        sections: [modelSection(summary), { title: 'By kind', lines: kindLines(summary.kinds) }, { title: 'Ids', lines: [`session ${file.id ?? '—'}`, `file ${file.path}`] }],
      };
    }
    if (item.id === 'project') {
      const { trees, summary } = view.project;
      const tickets = ticketGroups([view.session, ...trees].map(tree => ({ file: tree.file, usd: subsidyOf(tree.summary.total) })));
      const runs = trees.reduce((sum, tree) => sum + tree.children.length, view.session.children.length);
      return {
        title: 'Project',
        subtitle: subtitle ?? state.where?.cwd,
        fields: [
          ...scopeFields(summary),
          { label: 'sessions', value: `${plural(trees.length + 1, 'session')} · ${plural(runs, 'subagent run')}` },
          { label: 'folder', value: state.where?.cwd ?? '—' },
        ],
        sections: [
          modelSection(summary),
          { title: 'By kind', lines: kindLines(summary.kinds) },
          { title: 'Tickets', lines: tickets.length ? tickets.map(group => `${usd(group.usd)}  ${group.ticket} · ${plural(group.sessions, 'session')}`) : ['No ticket links or Jira keys in the prompts.'] },
        ],
      };
    }
    if (item.id === 'global') {
      const global = view.global;
      if (!global) return { title: 'All projects', subtitle: subtitle ?? 'reading…' };
      const { summary } = global;
      return {
        title: 'All projects',
        subtitle,
        fields: [
          ...scopeFields(summary),
          { label: 'sessions', value: `${plural(global.mains, 'session')} · ${plural(global.children, 'subagent run')}` },
          { label: 'projects', value: plural(global.projects.length, 'folder') },
        ],
        sections: [
          modelSection(summary),
          { title: 'By kind', lines: kindLines(summary.kinds) },
          { title: 'By project', lines: global.projects.slice(0, 20).map(project => `${usd(project.usd)}  ${project.cwd} · ${plural(project.sessions, 'session')}`) },
        ],
      };
    }
    const tree = view.project.trees.find(t => `file:${t.file.path}` === item.id);
    if (!tree) return { title: item.label.trim() };
    const { file, children, summary } = tree;
    return {
      title: labelOf(file),
      subtitle: `${ago(file.lastAt)}${file.startedAt ? ` · started ${new Date(file.startedAt).toLocaleString()}` : ''}`,
      fields: [
        ...scopeFields(summary),
        { label: 'subagents', value: children.length ? plural(children.length, 'run') : 'none' },
        { label: 'tickets', value: file.tickets.join(' · ') || '—' },
        { label: 'prompt', value: file.prompt ?? '—' },
      ],
      sections: [modelSection(summary), { title: 'Ids', lines: [`session ${file.id ?? '—'}`, `file ${basename(file.path)}`, ...(file.parentSession ? [`forked from ${basename(file.parentSession)}`] : [])] }],
    };
  };

  const spec = (ctx: ExtensionContext, initial: Scope): PanelSpec => ({
    title: 'Usage',
    summary: () => {
      const view = state.view;
      if (!view) return '';
      const parts = [`session ${usd(subsidyOf(view.session.summary.total))}`, `project ${usd(subsidyOf(view.project.summary.total))}`];
      parts.push(view.global ? `all ${usd(subsidyOf(view.global.summary.total))}` : 'all …');
      if (state.scanning) parts.push(state.scanning);
      return parts.join(' · ');
    },
    items,
    detail,
    actions: [{
      key: 'r', label: 'Rescan', bulk: true,
      run: (_item, panel) => { void refresh(ctx, true).then(() => panel.notice('Rescanned; list prices refreshed.', 'success')); panel.notice('Rescanning…'); },
    }],
    initial,
    empty: 'No usage recorded yet.',
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });

  /** Plain text for print and RPC modes: the scopes, then every model across projects. */
  const text = (ctx: ExtensionContext): string => {
    const lines = [panelText(spec(ctx, 'session'))];
    const summary = state.view?.global?.summary ?? state.view?.project.summary;
    if (summary) lines.push('', `By model (${state.view?.global ? 'all projects' : 'this project'}) · subsidy`, ...modelLines(summary.models));
    return lines.join('\n');
  };

  // Passive: keeps an open panel's session totals live. Returns nothing, so the message is untouched.
  pi.on('message_end', (_event, ctx) => {
    if (!listeners.size || !state.where) return;
    state.live = liveFile(ctx);
    rebuild();
    changed();
  });

  pi.registerCommand('usage', {
    description: brand('tokens and subsidy (API list-price value) · session | project | global'),
    getArgumentCompletions: completer(options),
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const word = args.trim().split(/\s+/)[0] ?? '';
      const initial: Scope = (SCOPES as readonly string[]).includes(word) ? word as Scope : 'session';
      if (!(ctx.hasUI && ctx.mode === 'tui')) {
        await refresh(ctx);
        ctx.ui.notify(text(ctx), 'info');
        return;
      }
      void refresh(ctx);
      await openPanel(ctx, spec(ctx, initial));
    },
  });
}
