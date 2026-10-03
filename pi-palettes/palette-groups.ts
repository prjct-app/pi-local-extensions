import { PALETTES, type Palette } from "./palettes.ts";

export type PaletteRow = { title: string } | { hint: string } | { palette: Palette };

export const OWN_GROUP = "Your palettes";
export const EDITOR_GROUP = "New · editor classics";
export const PHOTO_GROUP = "New · from photos";
export const OTHER_GROUP = "Other themes";

/** The picker group a palette belongs to, favorites aside. */
export function groupOf(id: string): string {
	const palette = PALETTES.find((p) => p.id === id);
	if (!palette) return OTHER_GROUP;
	if (!palette.bundled) return OWN_GROUP;
	return palette.group === "editor" ? EDITOR_GROUP : palette.group === "photo" ? PHOTO_GROUP : OTHER_GROUP;
}

export function groupedPalettes(favorites: ReadonlySet<string>): PaletteRow[] {
	const own = PALETTES.filter((palette) => groupOf(palette.id) === OWN_GROUP && !favorites.has(palette.id));
	const groups = [
		{ title: "Favorites", palettes: PALETTES.filter((palette) => favorites.has(palette.id)) },
		// Only shown once the person has palettes of their own.
		...(own.length ? [{ title: OWN_GROUP, palettes: own }] : []),
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
