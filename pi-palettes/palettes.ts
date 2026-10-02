export type Swatch = {
	name: string;
	hex: string;
};

export type Palette = {
	id: string;
	label: string;
	bundled: boolean;
	swatches: Swatch[];
};

import { EDITOR_PALETTES } from "./editor-palettes.ts";
import { ORIGINAL_PALETTES } from "./original-palettes.ts";
import { PHOTO_PALETTES } from "./photo-palettes.ts";

export const PALETTES: Palette[] = [...ORIGINAL_PALETTES, ...PHOTO_PALETTES, ...EDITOR_PALETTES];

export const PALETTE_IDS = PALETTES.map((palette) => palette.id);
export const BUNDLED_IDS = PALETTES.filter((palette) => palette.bundled).map((palette) => palette.id);

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const value = hex.replace("#", "");
	return {
		r: parseInt(value.slice(0, 2), 16),
		g: parseInt(value.slice(2, 4), 16),
		b: parseInt(value.slice(4, 6), 16),
	};
}

function rgbToHex(r: number, g: number, b: number): string {
	const toHex = (n: number) =>
		Math.max(0, Math.min(255, Math.round(n)))
			.toString(16)
			.padStart(2, "0")
			.toUpperCase();
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mix(a: string, b: string, t: number): string {
	const from = hexToRgb(a);
	const to = hexToRgb(b);
	return rgbToHex(
		from.r + (to.r - from.r) * t,
		from.g + (to.g - from.g) * t,
		from.b + (to.b - from.b) * t,
	);
}

function relLum(hex: string): number {
	const { r, g, b } = hexToRgb(hex);
	const channel = (value: number) => {
		const s = value / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function chipHex(hex: string): string {
	return relLum(hex) < 0.12 ? mix(hex, "#FFFFFF", 0.22) : hex;
}

const COLOR_ENABLED = !process.env.NO_COLOR;

function bg(hex: string, text: string): string {
	if (!COLOR_ENABLED) return text;
	const { r, g, b } = hexToRgb(hex);
	return `\x1b[48;2;${r};${g};${b}m${text}\x1b[49m`;
}

export function paintChip(hex: string): string {
	return bg(chipHex(hex), "  ");
}

export function findPalette(id: string | undefined): Palette | undefined {
	if (!id) return undefined;
	return PALETTES.find((palette) => palette.id === id);
}

export function resolvePaletteArg(arg: string): string | "next" | "prev" | "random" | undefined {
	const needle = arg.trim().toLowerCase();
	if (!needle) return undefined;
	if (needle === "next" || needle === "prev" || needle === "random") return needle;

	const exact = PALETTES.find(
		(palette) => palette.id === needle || palette.label.toLowerCase() === needle,
	);
	if (exact) return exact.id;

	const hits = PALETTES.filter(
		(palette) =>
			palette.id.startsWith(needle) ||
			palette.label.toLowerCase().includes(needle) ||
			palette.swatches.some((swatch) => swatch.name.toLowerCase().startsWith(needle)),
	);
	return hits.length === 1 ? hits[0].id : undefined;
}
