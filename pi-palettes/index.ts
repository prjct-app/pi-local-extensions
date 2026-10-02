import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	BUNDLED_IDS,
	findPalette,
	PALETTE_IDS,
	PALETTES,
	resolvePaletteArg,
} from "./palettes.ts";
import { brand, completer } from "@prjct.app/pi-tui-kit";
import { openPalettePanels } from "./palette-panel.ts";
import { watchActiveTheme, writeActiveTheme } from "./sync.ts";

const baseDir = dirname(fileURLToPath(import.meta.url));

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

export default function paletteThemes(pi: ExtensionAPI) {
	let stopThemeSync: (() => void) | undefined;

	pi.on("resources_discover", () => ({
		themePaths: BUNDLED_IDS.map((id) => join(baseDir, "themes", `${id}.json`)),
	}));

	pi.on("session_start", (_event, ctx) => {
		stopThemeSync?.();
		stopThemeSync = undefined;
		if (!ctx.hasUI) return;

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
	});

	pi.registerCommand("palette", {
		description: brand("color palette: picker with live preview, next, prev"),
		getArgumentCompletions: completer(() => [
			...PALETTES.map((palette) => ({ value: palette.id, description: `${palette.label}: ${palette.swatches.map((swatch) => swatch.name).join(" · ")}` })),
			{ value: "next", description: "next palette" },
			{ value: "prev", description: "previous palette" },
		]),
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;
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
