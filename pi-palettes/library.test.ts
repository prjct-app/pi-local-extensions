import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-palette-agent-"));
const { DEFAULT_COLORS, mergePalettes, parseLibrary, readBundled, syncThemeFiles, themeJson, writePrivate } = await import("./library.ts");
const { EDITOR_GROUP, PHOTO_GROUP, groupOf } = await import("./palette-groups.ts");
const { findPalette, resolvePaletteArg } = await import("./palettes.ts");

const HEX = /^#[0-9A-F]{6}$/;

test("the bundled library has 34 complete palettes that make loadable themes", () => {
	const { palettes } = readBundled();
	assert.equal(palettes.length, 34);
	assert.equal(new Set(palettes.map((p) => p.id)).size, 34);
	assert.deepEqual(palettes.filter((p) => p.group === "editor").map((p) => p.id),
		["dracula", "onedark", "tokyonight", "catppuccin", "nightowl", "nord", "monokai", "gruvbox", "claude"]);
	assert.equal(palettes.filter((p) => p.group === "photo").length, 8);
	for (const p of palettes) {
		const theme = themeJson(p);
		assert.equal(theme.name, p.id);
		assert.deepEqual(Object.keys(theme.colors).sort(), Object.keys(DEFAULT_COLORS).sort());
		for (const ref of [...Object.values(theme.colors), ...Object.values(theme.export)]) {
			assert.ok(ref === "" || HEX.test(ref) || ref in theme.vars, `${p.id}: ${ref}`);
		}
		assert.equal(p.swatches?.length, 5);
		for (const s of p.swatches ?? []) assert.ok(HEX.test(s.hex));
		assert.equal(findPalette(p.id)?.label, p.label);
		assert.equal(resolvePaletteArg(p.id), p.id);
	}
	assert.equal(groupOf("dracula"), EDITOR_GROUP);
	assert.equal(groupOf("glacier"), PHOTO_GROUP);
});

test("libraries from outside are cleaned, never trusted", () => {
	const lib = parseLibrary(JSON.stringify({
		format: "pi-palette",
		active: "mine",
		favorites: ["dracula", "../../etc", "DRACULA", 7],
		palettes: [
			{ id: "mine", label: "  Mine  ", vars: { canvas: "#000000", text: "#ffffff", accent: "#ff0000", secondary: "#00ff00", highlight: "#0000ff", success: "#00ff00", warning: "#ffff00", error: "#ff0000", evil: "url(x)" }, colors: { accent: "secondary", notARole: "accent", bashMode: "<script>" } },
			{ id: "../escape", vars: {} },
			{ id: "nocore", vars: { canvas: "#000000" } },
			{ id: "mine", label: "duplicate", vars: {} },
		],
	}));
	assert.deepEqual(lib.palettes.map((p) => p.id), ["mine"]);
	const mine = lib.palettes[0]!;
	assert.equal(mine.label, "Mine");
	assert.equal(mine.vars.canvas, "#000000");
	assert.equal(mine.vars.text, "#FFFFFF");
	assert.equal("evil" in mine.vars, false);
	assert.deepEqual(mine.colors, { accent: "secondary" });
	assert.deepEqual(lib.favorites, ["dracula"]);
	assert.equal(lib.active, "mine");
	assert.throws(() => parseLibrary("not json"), /not JSON/);
	assert.throws(() => parseLibrary("[]"), /not a palette library/);
	// A plain Pi theme file is a library of one.
	const single = parseLibrary(JSON.stringify({ name: "solo", vars: mine.vars }));
	assert.deepEqual(single.palettes.map((p) => p.id), ["solo"]);
});

test("your palettes replace bundled ones with the same id and add the rest", () => {
	const bundled = readBundled().palettes;
	const own = [{ ...bundled[0]!, label: "Mine now" }, { id: "extra", label: "Extra", vars: bundled[1]!.vars }];
	const merged = mergePalettes(bundled, own);
	assert.equal(merged.length, 35);
	assert.equal(merged[0]!.label, "Mine now");
	assert.equal(merged.at(-1)!.id, "extra");
});

test("theme files follow the palettes: written once, rewritten when changed, removed when gone", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-palette-themes-"));
	try {
		const palettes = readBundled().palettes.slice(0, 3);
		const paths = syncThemeFiles(palettes, dir);
		assert.equal(paths.length, 3);
		const first = statSync(paths[0]!).mtimeMs;
		writeFileSync(join(dir, "stale.json"), "{}");
		syncThemeFiles(palettes.slice(0, 2), dir);
		assert.deepEqual(readdirSync(dir).sort(), palettes.slice(0, 2).map((p) => `${p.id}.json`).sort());
		assert.equal(statSync(paths[0]!).mtimeMs, first);
		assert.equal(JSON.parse(readFileSync(paths[0]!, "utf8")).name, palettes[0]!.id);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("private files are readable only by their owner", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-palette-private-"));
	try {
		const path = join(dir, "nested", "auth.json");
		writePrivate(path, "{}");
		assert.equal(statSync(path).mode & 0o777, 0o600);
		assert.equal(statSync(join(dir, "nested")).mode & 0o777, 0o700);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
