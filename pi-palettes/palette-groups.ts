import { PALETTES, type Palette } from "./palettes.ts";
import { EDITOR_PALETTES } from "./editor-palettes.ts";
import { PHOTO_PALETTES } from "./photo-palettes.ts";

export type PaletteRow = { title: string } | { hint: string } | { palette: Palette };

const photoIds = new Set(PHOTO_PALETTES.map((palette) => palette.id));
const editorIds = new Set(EDITOR_PALETTES.map((palette) => palette.id));

export const EDITOR_GROUP = "New · editor classics";
export const PHOTO_GROUP = "New · from photos";
export const OTHER_GROUP = "Other themes";

/** The picker group a palette belongs to, favorites aside. */
export function groupOf(id: string): string {
	return editorIds.has(id) ? EDITOR_GROUP : photoIds.has(id) ? PHOTO_GROUP : OTHER_GROUP;
}

export function groupedPalettes(favorites: ReadonlySet<string>): PaletteRow[] {
	const groups = [
		{ title: "Favorites", palettes: PALETTES.filter((palette) => favorites.has(palette.id)) },
		...[EDITOR_GROUP, PHOTO_GROUP, OTHER_GROUP].map((title) => ({
			title,
			palettes: PALETTES.filter((palette) => groupOf(palette.id) === title && !favorites.has(palette.id)),
		})),
	];
	const rows: PaletteRow[] = [];
	for (const { title, palettes } of groups) {
		rows.push({ title });
		if (palettes.length === 0) rows.push({ hint: title === "Favorites" ? "Press f to add one" : "All saved as favorites" });
		else for (const palette of palettes) rows.push({ palette });
	}
	return rows;
}

export function orderedPalettes(rows: PaletteRow[]): Palette[] {
	return rows.flatMap((row) => "palette" in row ? [row.palette] : []);
}
