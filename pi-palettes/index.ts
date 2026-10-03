import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { brand, completer, setFact, type Tone } from "@prjct.app/pi-tui-kit";
import { isDue, KEEP, listVersions, readState, readVersion, runBackup, saveBeforeRestore, type BackupReason } from "./backup.ts";
import { FACT, factText, nextCheck, when } from "./backup-ui.ts";
import {
	assertSecureSite,
	claimLink,
	forgetAuth,
	getBackup,
	isNotFound,
	isUnauthorized,
	listBackups,
	pullLibrary,
	pushBackup,
	pushLibrary,
	readAuth,
	revokeToken,
	SITE,
	startLink,
	writeAuth,
	type CloudVersion,
} from "./cloud.ts";
import { readFavorites, writeFavorites } from "./favorites.ts";
import {
	DATA_DIR,
	mergePalettes,
	parseLibrary,
	readBundled,
	readUserLibrary,
	removeLegacyThemes,
	syncThemeFiles,
	writePrivate,
	writeUserLibrary,
	type Library,
} from "./library.ts";
import { findPalette, LIBRARY_ERROR, PALETTE_IDS, PALETTES, resolvePaletteArg } from "./palettes.ts";
import { openPalettePanels, type CategoryId, type PickerHost, type PickerInfo } from "./palette-panel.ts";
import { watchActiveTheme, writeActiveTheme } from "./sync.ts";

/** A palette to apply right after the next reload (set by import and sync). */
const PENDING_PATH = join(DATA_DIR, "pending.json");
const DOWNLOADS = join(homedir(), "Downloads");

function currentPaletteId(ctx: ExtensionContext): string | undefined {
	const name = ctx.ui.theme.name;
	return name && PALETTE_IDS.includes(name) ? name : undefined;
}

function publishPalette(ctx: ExtensionContext, id: string): void {
	const label = findPalette(id)?.label ?? id;
	try {
		writeActiveTheme(id);
		ctx.ui.notify(label, "info");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`${label} applied here, but open-window sync failed: ${message}`, "warning");
	}
}

function applyPalette(ctx: ExtensionContext, id: string): boolean {
	if (!ctx.hasUI) return false;
	const palette = findPalette(id);
	if (!palette) {
		ctx.ui.notify(`Unknown palette: ${id}`, "error");
		return false;
	}
	const result = ctx.ui.setTheme(id);
	if (!result.success) {
		ctx.ui.notify(result.error ?? `Could not apply ${palette.label}`, "error");
		return false;
	}
	publishPalette(ctx, id);
	return true;
}

function cyclePalette(ctx: ExtensionContext, step: number): void {
	const current = currentPaletteId(ctx);
	const index = current ? PALETTE_IDS.indexOf(current) : -1;
	const nextIndex = index === -1 ? 0 : (index + step + PALETTE_IDS.length) % PALETTE_IDS.length;
	applyPalette(ctx, PALETTE_IDS[nextIndex]!);
}

/** Account and backup state for the picker's details pane. */
function pickerInfo(): PickerInfo {
	const auth = readAuth();
	const state = readState();
	const account = auth
		? `${auth.username ? `@${auth.username}` : "Connected"} on ${SITE.replace(/^https?:\/\//, "")}`
		: "Not connected: backups stay on this computer";
	const backups = factText(state, listVersions().length, Boolean(auth), backupRunning).replace(/^palette backup /, "");
	return { connected: Boolean(auth), account, backups: `${backups} · next check ${nextCheck(state)}` };
}

/** What the picker reads and runs: backups here and on pi-themes, account state. */
function pickerHost(ctx: ExtensionContext): PickerHost {
	let cloud: CloudVersion[] = [];
	let problem: string | undefined;
	return {
		info: pickerInfo,
		backups: () => {
			const local = listVersions();
			const parts = [`${local.length}/${KEEP} local`];
			if (readAuth()) parts.push(problem ? `cloud: ${problem}` : `${cloud.length}/${KEEP} cloud`);
			parts.push(`next check ${nextCheck(readState())}`);
			return { local, cloud, cloudProblem: problem, summary: parts.join(" · ") };
		},
		readBackup: (file) => readVersion(file),
		refreshCloud: async () => {
			const auth = readAuth();
			if (!auth) { cloud = []; problem = undefined; return; }
			try {
				cloud = await listBackups(auth.token);
				problem = undefined;
			} catch (error) {
				problem = cloudProblem(error);
			}
		},
		backupNow: () => backup(ctx, "manual"),
		site: SITE.replace(/^https?:\/\//, ""),
	};
}

async function pickPalette(ctx: ExtensionCommandContext, initial?: CategoryId): Promise<void> {
	const result = await openPalettePanels(ctx, pickerHost(ctx), initial);
	if (result?.apply) publishPalette(ctx, result.apply);
	if (result?.restore) return restore(ctx, result.restore);
	switch (result?.action) {
		case "sync": return readAuth() ? sync(ctx) : login(ctx);
		case "login": return login(ctx);
		case "logout": return logout(ctx);
		case "import": return importLibrary(ctx, "");
		case "export": return exportLibrary(ctx, "");
	}
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const expand = (path: string) => resolve(path.replace(/^~(?=$|\/)/, homedir()));

/** Save a library as the person's own, then reload Pi so the themes register. */
async function installLibrary(ctx: ExtensionCommandContext, library: Library, note: string): Promise<void> {
	const bundledIds = new Set(readBundled().palettes.map((p) => p.id));
	const own = library.palettes;
	writeUserLibrary({ format: "pi-palette", version: 1, palettes: own });
	// Pi finds theme files at load, so they have to be there before the reload.
	try { syncThemeFiles(mergePalettes(readBundled().palettes, own)); } catch { /* the reload still brings the library */ }
	const known = new Set([...bundledIds, ...own.map((p) => p.id)]);
	if (library.favorites) writeFavorites(library.favorites.filter((id) => known.has(id)));
	if (library.active && known.has(library.active)) writePrivate(PENDING_PATH, JSON.stringify({ theme: library.active }));
	ctx.ui.notify(note, "info");
	await ctx.reload();
}

async function importLibrary(ctx: ExtensionCommandContext, arg: string): Promise<void> {
	const candidates = arg
		? [expand(arg)]
		: [join(DOWNLOADS, "library.json"), join(DOWNLOADS, "pi-palette.json")];
	const path = candidates.find((p) => existsSync(p));
	if (!path) {
		ctx.ui.notify(`No library found. Try /palette import ~/Downloads/library.json`, "warning");
		return;
	}
	let library: Library;
	try {
		library = parseLibrary(readFileSync(path, "utf8"));
	} catch (error) {
		ctx.ui.notify(`Could not import ${path}: ${message(error)}`, "error");
		return;
	}
	const ok = await ctx.ui.confirm(
		"Import palettes",
		`${library.palettes.length} palettes and ${library.favorites?.length ?? 0} favorites from ${path}. This replaces your library and favorites.`,
	);
	if (!ok) return;
	await installLibrary(ctx, library, `Imported ${library.palettes.length} palettes`);
}

function exportLibrary(ctx: ExtensionContext, arg: string): void {
	const own = (() => { try { return readUserLibrary(); } catch { return undefined; } })();
	let favorites: string[] = [];
	try { favorites = [...readFavorites()]; } catch { /* unreadable favorites are left out */ }
	const library: Library = {
		format: "pi-palette",
		version: 1,
		exportedAt: new Date().toISOString(),
		...(currentPaletteId(ctx) ? { active: currentPaletteId(ctx) } : {}),
		favorites,
		palettes: own?.palettes ?? [],
	};
	const path = arg ? expand(arg) : join(existsSync(DOWNLOADS) ? DOWNLOADS : homedir(), "pi-palette-export.json");
	try {
		writePrivate(path, `${JSON.stringify(library, null, "\t")}\n`);
		ctx.ui.notify(`Exported ${library.palettes.length} palettes and ${favorites.length} favorites to ${path}`, "info");
	} catch (error) {
		ctx.ui.notify(`Could not export: ${message(error)}`, "error");
	}
}

/** Best effort: open the approval page in the default browser. */
function openBrowser(url: string): void {
	const [cmd, args] = platform() === "darwin" ? ["open", [url]] : platform() === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
	try {
		const child = spawn(cmd, args as string[], { stdio: "ignore", detached: true });
		child.on("error", () => { /* no browser available: the URL is on screen */ });
		child.unref();
	} catch { /* the URL is on screen */ }
}

let stopLogin: (() => void) | undefined;

async function login(ctx: ExtensionCommandContext): Promise<void> {
	const existing = readAuth();
	if (existing) {
		ctx.ui.notify(`Already connected${existing.username ? ` as @${existing.username}` : ""}. /palette sync, or /palette logout`, "info");
		return;
	}
	let link;
	try {
		assertSecureSite();
		link = await startLink(`Pi · ${platform()}`);
	} catch (error) {
		ctx.ui.notify(`Could not reach ${SITE}: ${message(error)}`, "error");
		return;
	}
	ctx.ui.notify(`Approve code ${link.code} at ${link.url} (signed in). Waiting in the background…`, "info");
	openBrowser(link.url);
	void waitForApproval(ctx, link);
}

/** Poll until the code is approved on the site, then keep the token on this computer only. */
async function waitForApproval(ctx: ExtensionContext, link: { poll: string; expiresAt: string }): Promise<void> {
	stopLogin?.();
	let stopped = false;
	stopLogin = () => { stopped = true; };
	const deadline = Date.parse(link.expiresAt) || Date.now() + 10 * 60_000;
	while (!stopped && Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 3000));
		if (stopped) return;
		try {
			const claim = await claimLink(link.poll);
			if (claim.status === "ok") {
				writeAuth({ token: claim.token, username: claim.username, site: SITE, connectedAt: new Date().toISOString() });
				ctx.ui.notify(`Connected${claim.username ? ` as @${claim.username}` : ""}. Run /palette sync to bring your palettes.`, "info");
				// The first cloud backup now, not at the next weekly check.
				const { text, tone } = await backup(ctx, "connect");
				safely(() => ctx.ui.notify(text, NOTIFY[tone]));
				return;
			}
			if (claim.status !== "pending") break;
		} catch { /* a network blip: keep waiting until the code expires */ }
	}
	if (!stopped) ctx.ui.notify("The login code expired. Run /palette login again.", "warning");
}

async function sync(ctx: ExtensionCommandContext): Promise<void> {
	const auth = readAuth();
	if (!auth) {
		ctx.ui.notify("Not connected. Run /palette login first, or use /palette import with a file.", "warning");
		return;
	}
	try {
		const local = readUserLibrary();
		let favorites: string[] = [];
		try { favorites = [...readFavorites()]; } catch { /* sync the palettes anyway */ }
		const pushed = await pushLibrary(auth.token, { format: "pi-palette", version: 1, favorites, palettes: local?.palettes ?? [] });
		const remote = await pullLibrary(auth.token);
		const active = currentPaletteId(ctx);
		await installLibrary(
			ctx,
			{ ...remote, ...(active ? { active } : {}) },
			`Synced with ${SITE}${remote.user ? ` as @${remote.user}` : ""}: ${remote.palettes.length} palettes, ${remote.favorites?.length ?? 0} favorites (${pushed.saved} sent)`,
		);
	} catch (error) {
		if (isUnauthorized(error)) {
			forgetAuth();
			ctx.ui.notify("This Pi was disconnected from pi-themes. Run /palette login again.", "warning");
			return;
		}
		ctx.ui.notify(`Sync failed: ${message(error)}`, "error");
	}
}

async function logout(ctx: ExtensionContext): Promise<void> {
	const auth = readAuth();
	stopLogin?.();
	if (!auth) {
		ctx.ui.notify("Not connected.", "info");
		return;
	}
	try { await revokeToken(auth.token); } catch { /* removed locally either way; it can also be revoked on the site */ }
	forgetAuth();
	showBackupFact(ctx);
	ctx.ui.notify("Disconnected. Your palettes and their backups stay on this computer.", "info");
}

/** The library as it is on this computer now. Throws when the library file cannot be read. */
function snapshot(ctx: ExtensionContext): Library {
	const own = readUserLibrary()?.palettes ?? [];
	let favorites: string[] = [];
	try { favorites = [...readFavorites()]; } catch { /* back up the palettes anyway */ }
	const active = currentPaletteId(ctx);
	return { format: "pi-palette", version: 1, ...(active ? { active } : {}), favorites, palettes: own };
}

/** UI calls from a background backup may land after the session was replaced. */
function safely(fn: () => void): void {
	try { fn(); } catch { /* that session's UI is gone */ }
}

let backupRunning = false;

function showBackupFact(ctx: ExtensionContext): void {
	safely(() => setFact(ctx, FACT, factText(readState(), listVersions().length, Boolean(readAuth()), backupRunning)));
}

function cloudProblem(error: unknown): string {
	if (isNotFound(error)) return `${SITE} does not keep backups yet`;
	if (error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError")) return `could not reach ${SITE}`;
	return message(error);
}

/** Cloud errors in a few words; a rejected token stays recognizable. */
async function cloudCall<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (isUnauthorized(error)) throw error;
		throw new Error(cloudProblem(error));
	}
}

type Outcome = { text: string; tone: Tone };

/** One backup run. Never throws: the outcome says what happened, in one line. */
async function backup(ctx: ExtensionContext, reason: BackupReason): Promise<Outcome> {
	if (backupRunning) return { text: "A backup is already running.", tone: "muted" };
	backupRunning = true;
	showBackupFact(ctx);
	try {
		const auth = readAuth();
		const client = `Pi · ${platform()}`;
		const result = await runBackup({
			local: snapshot(ctx),
			reason,
			isUnauthorized,
			cloud: auth
				? {
					pull: () => cloudCall(() => pullLibrary(auth.token)),
					push: async (library) => ({ count: (await cloudCall(() => pushBackup(auth.token, library, client))).count }),
				}
				: undefined,
		});
		if (!result) return { text: "Another Pi is backing up right now.", tone: "muted" };
		const saved = result.written ? `Backed up: ${result.localCount}/${KEEP} versions here` : `Nothing changed since the last backup (${result.localCount}/${KEEP} here)`;
		if (result.unauthorized) {
			forgetAuth();
			return { text: `${saved}. This Pi was disconnected from pi-themes; run /palette login to back up to the cloud again.`, tone: "warning" };
		}
		if (result.cloudError) return { text: `${saved}, but the cloud copy failed: ${result.cloudError}`, tone: "warning" };
		return { text: result.cloudCount !== undefined ? `${saved}, ${result.cloudCount}/${KEEP} on ${SITE}.` : `${saved}.`, tone: "success" };
	} catch (error) {
		return { text: `Palette backup failed: ${message(error)}`, tone: "error" };
	} finally {
		backupRunning = false;
		showBackupFact(ctx);
	}
}

const NOTIFY: Record<Tone, "info" | "warning" | "error"> = { accent: "info", success: "info", muted: "info", dim: "info", text: "info", warning: "warning", error: "error" };

async function backupNow(ctx: ExtensionContext): Promise<void> {
	const { text, tone } = await backup(ctx, "manual");
	ctx.ui.notify(text, NOTIFY[tone]);
}

/** Replace the library with a backed-up version, after saving the current one. */
async function restore(ctx: ExtensionCommandContext, id: string): Promise<void> {
	const [side, key = ""] = id.split(/:(.*)/s);
	let library: Library;
	let label: string;
	try {
		if (side === "cloud") {
			const auth = readAuth();
			if (!auth) throw new Error("this Pi is not connected; run /palette login");
			library = await getBackup(auth.token, key);
			label = "the cloud backup";
		} else {
			const version = readVersion(key);
			library = version.local;
			label = `the backup from ${when(version.createdAt)}`;
		}
		await saveBeforeRestore(snapshot(ctx));
	} catch (error) {
		ctx.ui.notify(`Could not restore: ${isUnauthorized(error) ? "this Pi was disconnected; run /palette login" : message(error)}`, "error");
		return;
	}
	await installLibrary(ctx, library, `Restored ${label}: ${library.palettes.length} palettes, ${library.favorites?.length ?? 0} favorites`);
}

async function browseBackups(ctx: ExtensionCommandContext): Promise<void> {
	await pickPalette(ctx, "backups");
}

export default function paletteThemes(pi: ExtensionAPI) {
	let stopThemeSync: (() => void) | undefined;

	// Theme files are generated from the palettes (bundled + the person's library) on every
	// load, into Pi's own themes folder: Pi applies the theme in settings before any
	// extension event runs, so a theme that only appears through resources_discover is
	// "not found" at startup.
	try {
		syncThemeFiles(PALETTES);
		removeLegacyThemes();
	} catch { /* the theme files stay as they were */ }

	pi.on("session_start", (_event, ctx) => {
		stopThemeSync?.();
		stopThemeSync = undefined;
		if (!ctx.hasUI) return;
		if (LIBRARY_ERROR) ctx.ui.notify(LIBRARY_ERROR, "warning");

		if (existsSync(PENDING_PATH)) {
			try {
				const pending = JSON.parse(readFileSync(PENDING_PATH, "utf8")) as { theme?: string };
				if (pending.theme && findPalette(pending.theme)) applyPalette(ctx, pending.theme);
			} catch { /* ignore a broken marker */ }
			rmSync(PENDING_PATH, { force: true });
		}

		stopThemeSync = watchActiveTheme((id) => {
			if (!findPalette(id) || ctx.ui.theme.name === id) return;
			const result = ctx.ui.setTheme(id);
			if (!result.success) {
				ctx.ui.notify(result.error ?? `Could not sync palette ${id}`, "warning");
			}
		});

		// The weekly backup: checked on every start, run at most once a week, in the background.
		showBackupFact(ctx);
		if (isDue(readState())) {
			void backup(ctx, "weekly").then(({ text, tone }) => {
				if (tone === "warning" || tone === "error") safely(() => ctx.ui.notify(text, NOTIFY[tone]));
			});
		}
	});

	pi.on("session_shutdown", () => {
		stopThemeSync?.();
		stopThemeSync = undefined;
		stopLogin?.();
	});

	const ACTIONS: Record<string, string> = {
		import: "import a palette library file (from pi-themes)",
		export: "export your palettes and favorites to a file",
		login: "connect this Pi to your pi-themes account",
		sync: "send and bring your palettes (pi-themes account)",
		logout: "disconnect from pi-themes",
		backup: "back up your palettes now (here, and to pi-themes when connected)",
		backups: "browse your palette backups and restore one",
		next: "next palette",
		prev: "previous palette",
	};

	pi.registerCommand("palette", {
		description: brand("color palette: picker with live preview, import/export, sync, backups"),
		getArgumentCompletions: completer(() => [
			...PALETTES.map((palette) => ({ value: palette.id, description: `${palette.label}: ${palette.swatches.map((swatch) => swatch.name).join(" · ")}` })),
			...Object.entries(ACTIONS).map(([value, description]) => ({ value, description })),
		]),
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;
			const [verb = "", ...rest] = args.trim().split(/\s+/);
			const tail = rest.join(" ");
			switch (verb.toLowerCase()) {
				case "import": return importLibrary(ctx, tail);
				case "export": return exportLibrary(ctx, tail);
				case "login": return login(ctx);
				case "sync": return sync(ctx);
				case "logout": return logout(ctx);
				case "backup": return backupNow(ctx);
				case "backups": return browseBackups(ctx);
			}
			const resolved = resolvePaletteArg(args);
			if (resolved === "next") {
				cyclePalette(ctx, 1);
				return;
			}
			if (resolved === "prev") {
				cyclePalette(ctx, -1);
				return;
			}
			if (resolved && resolved !== "random") {
				applyPalette(ctx, resolved);
				return;
			}
			if (args.trim() && resolved !== "random") {
				ctx.ui.notify(`Unknown palette: ${args.trim()}`, "warning");
			}
			await pickPalette(ctx);
		},
	});
}

