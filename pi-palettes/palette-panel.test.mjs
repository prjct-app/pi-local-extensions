import assert from "node:assert/strict";
import test from "node:test";
import { openPalettePanels } from "./palette-panel.ts";

const theme = { fg: (_color, text) => text, bold: (text) => text };

test("palette picker renders at narrow and wide terminal widths", async () => {
	const ui = {
		theme: { name: "orchard" },
		setTheme(name) { this.theme.name = name; return { success: true }; },
		custom(factory) {
			return new Promise((done) => {
				const tui = { terminal: { rows: 30 }, requestRender() {} };
				const panel = factory(tui, theme, undefined, done);
				for (const width of [18, 50, 100]) {
					const lines = panel.render(width);
					assert.ok(lines.length > 0);
					assert.ok(lines.some((line) => line.includes("Palette")));
				}
				panel.handleInput("j");
				assert.ok(panel.render(100).length > 0);
				panel.handleInput("q");
			});
		},
	};
	assert.equal(await openPalettePanels({ ui }), undefined);
	assert.equal(ui.theme.name, "orchard");
});
