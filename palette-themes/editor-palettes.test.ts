import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { EDITOR_PALETTES } from "./editor-palettes.ts";
import { EDITOR_GROUP, groupedPalettes, groupOf } from "./palette-groups.ts";
import { BUNDLED_IDS, findPalette, PALETTE_IDS, resolvePaletteArg } from "./palettes.ts";

const here = import.meta.dirname;

test("editor palettes are selectable and each has a complete, loadable theme", () => {
	assert.deepEqual(EDITOR_PALETTES.map((palette) => palette.id),
		["dracula", "onedark", "tokyonight", "catppuccin", "nightowl", "nord", "monokai", "gruvbox", "claude"]);
	assert.equal(new Set(PALETTE_IDS).size, PALETTE_IDS.length);
	const manifest = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
	const reference = JSON.parse(readFileSync(join(here, "themes", "orchard.json"), "utf8"));
	for (const palette of EDITOR_PALETTES) {
		assert.equal(findPalette(palette.id), palette);
		assert.equal(resolvePaletteArg(palette.id), palette.id);
		assert.equal(resolvePaletteArg(palette.label), palette.id);
		assert.ok(BUNDLED_IDS.includes(palette.id));
		assert.equal(groupOf(palette.id), EDITOR_GROUP);
		assert.equal(palette.swatches.length, 5);
		assert.ok(manifest.pi.themes.includes(`./themes/${palette.id}.json`));
		const theme = JSON.parse(readFileSync(join(here, "themes", `${palette.id}.json`), "utf8"));
		assert.equal(theme.name, palette.id);
		for (const swatch of palette.swatches) assert.equal(theme.vars[swatch.name], swatch.hex);
		// Same color slots as the existing themes, each pointing at a defined var.
		assert.deepEqual(Object.keys(theme.colors).sort(), Object.keys(reference.colors).sort());
		for (const name of Object.values(theme.colors) as string[]) assert.ok(name in theme.vars, `${palette.id}: ${name}`);
	}
});

test("editor classics get their own group, before the photo palettes", () => {
	const titles = groupedPalettes(new Set()).flatMap((row) => "title" in row ? [row.title] : []);
	assert.deepEqual(titles, ["Favorites", EDITOR_GROUP, "New · from photos", "Other themes"]);
});
