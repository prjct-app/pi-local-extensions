import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { BUNDLED_IDS, findPalette, PALETTE_IDS, resolvePaletteArg } from "./palettes.ts";
import { PHOTO_PALETTES } from "./photo-palettes.ts";

const themeDirectory = join(import.meta.dirname, "themes");

test("photo palettes are selectable and each has a matching loadable theme", () => {
	assert.equal(PHOTO_PALETTES.length, 8);
	assert.equal(new Set(PALETTE_IDS).size, PALETTE_IDS.length);
	const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "package.json"), "utf8"));
	for (const palette of PHOTO_PALETTES) {
		assert.equal(findPalette(palette.id), palette);
		assert.equal(resolvePaletteArg(palette.id), palette.id);
		assert.ok(BUNDLED_IDS.includes(palette.id));
		assert.equal(palette.swatches.length, 5);
		assert.ok(palette.swatches.every((swatch) => /^#[0-9A-F]{6}$/.test(swatch.hex)));
		assert.ok(manifest.pi.themes.includes(`./themes/${palette.id}.json`));
		const theme = JSON.parse(readFileSync(join(themeDirectory, `${palette.id}.json`), "utf8"));
		assert.equal(theme.name, palette.id);
		for (const swatch of palette.swatches) assert.equal(theme.vars[swatch.name], swatch.hex);
	}
});
