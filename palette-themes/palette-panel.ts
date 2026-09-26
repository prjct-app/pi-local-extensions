import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, type Component, type Focusable, type TUI } from "@earendil-works/pi-tui";
import { fit } from "@prjct.app/pi-tui-kit";
import { readFavorites, toggleFavorite } from "./favorites.ts";
import { groupedPalettes, groupOf, orderedPalettes } from "./palette-groups.ts";
import { PALETTES, paintChip, type Palette } from "./palettes.ts";

type Pane = "browser" | "detail";

function previewStrip(palette: Palette): string {
	if (process.env.NO_COLOR) return palette.swatches.map((swatch) => swatch.name).join(" · ");
	return palette.swatches.map((swatch) => paintChip(swatch.hex)).join(" ");
}

function palettePanels(
	ctx: ExtensionContext,
	tui: TUI,
	theme: Theme,
	originalTheme: string | undefined,
	done: (value: string | undefined) => void,
): Component & Focusable & { dispose(): void } {
	let favorites: Set<string>;
	let loadError = "";
	try { favorites = readFavorites(); }
	catch (error) {
		favorites = new Set();
		loadError = `Favorites unavailable: ${error instanceof Error ? error.message : String(error)}`;
	}
	const state = {
		selected: ctx.ui.theme.name && PALETTES.some((palette) => palette.id === ctx.ui.theme.name)
			? ctx.ui.theme.name : PALETTES[0]!.id,
		focus: "browser" as Pane, notice: loadError, applied: false, closed: false,
	};
	const accent = (text: string): string => theme.fg("accent", text);
	const dim = (text: string): string => theme.fg("dim", text);
	const rows = () => groupedPalettes(favorites);
	const current = (): Palette => PALETTES.find((palette) => palette.id === state.selected)!;
	const request = (): void => { if (!state.closed) tui.requestRender(); };
	const restore = (): void => {
		if (originalTheme && ctx.ui.theme.name !== originalTheme) ctx.ui.setTheme(originalTheme);
	};
	const close = (apply: boolean): void => {
		if (state.closed) return;
		state.applied = apply;
		state.closed = true;
		if (!apply) restore();
		done(apply ? current().id : undefined);
	};
	const preview = (): void => {
		const result = ctx.ui.setTheme(current().id);
		state.notice = result.success ? "" : result.error ?? `Could not preview ${current().label}`;
	};
	const move = (delta: number): void => {
		const ordered = orderedPalettes(rows());
		const index = ordered.findIndex((palette) => palette.id === state.selected);
		const next = ordered[Math.max(0, Math.min(ordered.length - 1, index + delta))];
		if (!next || next.id === state.selected) return;
		state.selected = next.id;
		preview();
		request();
	};
	const keyed = (key: string, label: string): string => `${accent(key)}${dim(` ${label}`)}`;

	if (!PALETTES.some((palette) => palette.id === ctx.ui.theme.name)) preview();

	return {
		render(width: number): string[] {
			const terminalRows = tui.terminal?.rows ?? 30;
			const height = Math.max(8, Math.min(24, terminalRows));
			if (width < 24) return [accent(theme.bold("Palette")), dim("Need a wider terminal.")].map((line) => fit(line, width));

			const wide = width >= 72;
			const bodyHeight = Math.max(4, height - 4);
			const leftWidth = wide ? Math.min(26, Math.max(18, Math.floor(width * 0.27))) : Math.max(1, width - 2);
			const rightWidth = wide ? Math.max(1, width - leftWidth - 3) : Math.max(1, width - 2);
			const selected = current();
			const visibleRows = Math.max(1, bodyHeight - 1);
			const entries = rows();
			const selectedRow = entries.findIndex((row) => "palette" in row && row.palette.id === state.selected);
			const from = Math.max(0, Math.min(selectedRow - Math.floor(visibleRows / 2), entries.length - visibleRows));
			const browser = [
				accent(theme.bold(`${state.focus === "browser" ? "› " : "  "}Themes`)),
				...entries.slice(from, from + visibleRows).map((row) => {
					if ("title" in row) return dim(`  ${row.title}`);
					if ("hint" in row) return dim(`    ${row.hint}`);
					const { palette } = row;
					const chosen = palette.id === state.selected;
					const lead = chosen && state.focus === "browser" ? accent(theme.bold("›")) : " ";
					const star = favorites.has(palette.id) ? accent("★") : " ";
					const name = chosen ? accent(theme.bold(palette.label)) : palette.label;
					const chips = [0, 2, 4].map((index) => paintChip(palette.swatches[index]!.hex)).join(" ");
					return `${lead}${star} ${name} ${chips}`;
				}),
			];
			const nameWidth = Math.max(...selected.swatches.map((swatch) => swatch.name.length));
			const details = [
				accent(theme.bold(`${state.focus === "detail" ? "› " : "  "}Details`)),
				theme.bold(selected.label),
				theme.fg("success", "Live preview"),
				dim(`${favorites.has(selected.id) ? "★ Favorite · " : ""}${groupOf(selected.id)}`),
				"",
				accent("Palette"),
				previewStrip(selected),
				"",
				...selected.swatches.map((swatch) => `${paintChip(swatch.hex)} ${swatch.name.padEnd(nameWidth)}  ${swatch.hex}`),
			];

			const title = ` ${accent(theme.bold("Palette"))}  ${dim(`${PALETTES.length} themes · ${favorites.size} favorites · ${selected.label}`)}`;
			const body = Array.from({ length: bodyHeight }, (_, index) => {
				if (!wide) {
					const pane = state.focus === "browser" ? browser : details;
					return ` ${fit(pane[index] ?? "", Math.max(1, width - 2))} `;
				}
				return `${fit(browser[index] ?? "", leftWidth)} ${dim("│")} ${fit(details[index] ?? "", rightWidth)}`;
			});
			const footer = state.notice
				? theme.fg("error", state.notice)
				: [keyed("↑↓", "preview"), keyed("f", "favorite"), keyed("a", "apply"), keyed("tab", "details"), keyed("esc", "cancel")].join(dim(" · "));
			return [
				fit(title, width),
				dim("─".repeat(width)),
				...body,
				dim("─".repeat(width)),
				fit(` ${footer}`, width),
			];
		},
		handleInput(data: string): void {
			if (matchesKey(data, Key.escape)) {
				if (state.focus === "detail") state.focus = "browser";
				else close(false);
			} else if (data === "q") close(false);
			else if (data === "a") {
				preview();
				if (!state.notice) close(true);
			}
			else if (data === "f") {
				try { favorites = toggleFavorite(current().id); state.notice = ""; }
				catch (error) { state.notice = `Could not save favorite: ${error instanceof Error ? error.message : String(error)}`; }
			}
			else if (matchesKey(data, Key.tab)) state.focus = state.focus === "browser" ? "detail" : "browser";
			else if (matchesKey(data, Key.right) || matchesKey(data, Key.enter)) state.focus = "detail";
			else if (matchesKey(data, Key.left)) state.focus = "browser";
			else if (matchesKey(data, Key.up) || data === "k") move(-1);
			else if (matchesKey(data, Key.down) || data === "j") move(1);
			else if (matchesKey(data, Key.home)) { state.selected = orderedPalettes(rows())[0]!.id; preview(); }
			else if (matchesKey(data, Key.end)) { state.selected = orderedPalettes(rows()).at(-1)!.id; preview(); }
			else return;
			request();
		},
		invalidate(): void {},
		dispose(): void {
			if (!state.applied) restore();
			state.closed = true;
		},
		get focused() { return true; },
		set focused(_value: boolean) {},
	};
}

export async function openPalettePanels(ctx: ExtensionContext): Promise<string | undefined> {
	const originalTheme = ctx.ui.theme.name;
	return ctx.ui.custom<string | undefined>((tui, theme, _keybindings, done) =>
		palettePanels(ctx, tui, theme, originalTheme, done));
}
