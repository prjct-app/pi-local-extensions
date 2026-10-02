import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readFavorites, toggleFavorite } from "./favorites.ts";
import { groupedPalettes, orderedPalettes } from "./palette-groups.ts";
import { PALETTES } from "./palettes.ts";

function names(favorites: ReadonlySet<string>): string[] {
	return groupedPalettes(favorites).flatMap((row) => "title" in row ? [row.title] : []);
}

test("new editor and photo themes appear separately, without duplicates", () => {
	const rows = groupedPalettes(new Set());
	assert.deepEqual(names(new Set()), ["Favorites", "New · editor classics", "New · from photos", "Other themes"]);
	assert.ok(rows.some((row) => "hint" in row && row.hint === "Press f to add one"));
	assert.deepEqual(orderedPalettes(rows).slice(9, 17).map((palette) => palette.id),
		["glacier", "ember", "iris", "hearth", "atelier", "bloom", "tidepool", "orchard"]);
	assert.equal(new Set(orderedPalettes(rows).map((palette) => palette.id)).size, PALETTES.length);
});

test("favorites move to the first section and survive reload", () => {
	const directory = mkdtempSync(join(tmpdir(), "pi-palette-favorites-"));
	const path = join(directory, "nested", "favorites.json");
	try {
		assert.deepEqual([...readFavorites(path)], []);
		let favorites = toggleFavorite("orchard", path);
		favorites = toggleFavorite("tensor", path);
		assert.deepEqual(names(favorites), ["Favorites", "New · editor classics", "New · from photos", "Other themes"]);
		assert.deepEqual(orderedPalettes(groupedPalettes(favorites)).slice(0, 2).map((palette) => palette.id), ["tensor", "orchard"]);
		assert.deepEqual([...readFavorites(path)], ["orchard", "tensor"]);
		favorites = toggleFavorite("orchard", path);
		assert.deepEqual([...favorites], ["tensor"]);
		assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), ["tensor"]);
		assert.throws(() => toggleFavorite("not-a-theme", path), /Unknown palette/);
		writeFileSync(path, "not JSON");
		assert.throws(() => toggleFavorite("tensor", path));
		assert.equal(readFileSync(path, "utf8"), "not JSON");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
