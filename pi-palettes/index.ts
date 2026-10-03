import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { brand, completer } from "@prjct.app/pi-tui-kit";
import { assertSecureSite, claimLink, forgetAuth, isUnauthorized, pullLibrary, pushLibrary, readAuth, revokeToken, SITE, startLink, writeAuth } from "./cloud.ts";
import { readFavorites, writeFavorites } from "./favorites.ts";
import {
	DATA_DIR,
	parseLibrary,
	readBundled,
	readUserLibrary,
	syncThemeFiles,
	writePrivate,
	writeUserLibrary,
	type Library,
} from "./library.ts";
import { findPalette, LIBRARY_ERROR, PALETTE_IDS, PALETTES, resolvePaletteArg } from "./palettes.ts";
import { openPalettePanels } from "./palette-panel.ts";
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

async function pickPalette(ctx: ExtensionContext): Promise<void> {
	const applied = await openPalettePanels(ctx);
	if (applied) publishPalette(ctx, applied);
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const expand = (path: string) => resolve(path.replace(/^~(?=$|\/)/, homedir()));

/** Save a library as the person's own, then reload Pi so the themes register. */
async function installLibrary(ctx: ExtensionCommandContext, library: Library, note: string): Promise<void> {
	const bundledIds = new Set(readBundled().palettes.map((p) => p.id));
	const own = library.palettes;
	writeUserLibrary({ format: "pi-palette", version: 1, palettes: own });
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
	ctx.ui.notify("Disconnected. Your palettes stay on this computer.", "info");
}

export default function paletteThemes(pi: ExtensionAPI) {
	let stopThemeSync: (() => void) | undefined;

	// Theme files are generated from the palettes (bundled + the person's library) on every load.
	pi.on("resources_discover", () => {
		try {
			return { themePaths: syncThemeFiles(PALETTES) };
		} catch {
			return { themePaths: [] };
		}
	});

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
		next: "next palette",
		prev: "previous palette",
	};

	pi.registerCommand("palette", {
		description: brand("color palette: picker with live preview, import/export, sync"),
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

