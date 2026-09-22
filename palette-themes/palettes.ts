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

export const PALETTES: Palette[] = [
	{
		id: "prjct-theme",
		label: "Diff",
		bundled: false,
		swatches: [
			{ name: "teal", hex: "#5FC4B8" },
			{ name: "coral", hex: "#F08472" },
			{ name: "charcoal", hex: "#11161D" },
			{ name: "ice", hex: "#D8DDDF" },
			{ name: "gray", hex: "#8B969B" },
		],
	},
	{
		id: "tensor",
		label: "Tensor",
		bundled: true,
		swatches: [
			{ name: "cyan", hex: "#20D6FF" },
			{ name: "cobalt", hex: "#5B8CFF" },
			{ name: "green", hex: "#56E39F" },
			{ name: "coral", hex: "#FF6B8A" },
			{ name: "violet", hex: "#C084FC" },
		],
	},
	{
		id: "neural",
		label: "Neural",
		bundled: true,
		swatches: [
			{ name: "iris", hex: "#B77BFF" },
			{ name: "fuchsia", hex: "#FF5CCB" },
			{ name: "mint", hex: "#5EE6B0" },
			{ name: "rose", hex: "#FF667A" },
			{ name: "sky", hex: "#6EC8FF" },
		],
	},
	{
		id: "kernel",
		label: "Kernel",
		bundled: true,
		swatches: [
			{ name: "phosphor", hex: "#38F28F" },
			{ name: "teal", hex: "#25D0B1" },
			{ name: "lime", hex: "#B7F34A" },
			{ name: "amber", hex: "#FFC857" },
			{ name: "red", hex: "#FF5F6D" },
		],
	},
	{
		id: "token",
		label: "Token",
		bundled: true,
		swatches: [
			{ name: "gold", hex: "#FFB84D" },
			{ name: "orange", hex: "#FF7A3D" },
			{ name: "mint", hex: "#54D6B3" },
			{ name: "red", hex: "#FF6262" },
			{ name: "azure", hex: "#71B7FF" },
		],
	},
	{
		id: "vector",
		label: "Vector",
		bundled: true,
		swatches: [
			{ name: "cyan", hex: "#33D1FF" },
			{ name: "cobalt", hex: "#5A7DFF" },
			{ name: "seafoam", hex: "#4DDEB5" },
			{ name: "solar", hex: "#FFD166" },
			{ name: "aurora", hex: "#A78BFA" },
		],
	},
	{
		id: "agent",
		label: "Agent",
		bundled: true,
		swatches: [
			{ name: "orchid", hex: "#C77DFF" },
			{ name: "indigo", hex: "#6E8BFF" },
			{ name: "green", hex: "#5CE1A6" },
			{ name: "pink", hex: "#FF6B9E" },
			{ name: "hologram", hex: "#55DDE0" },
		],
	},
	{
		id: "flux",
		label: "Flux",
		bundled: true,
		swatches: [
			{ name: "mint", hex: "#4EF2C2" },
			{ name: "aqua", hex: "#2DCEF0" },
			{ name: "lime", hex: "#A8F060" },
			{ name: "coral", hex: "#FF6F79" },
			{ name: "lavender", hex: "#B69CFF" },
		],
	},
	{
		id: "synapse",
		label: "Synapse",
		bundled: true,
		swatches: [
			{ name: "peach", hex: "#FF9F68" },
			{ name: "coral", hex: "#FF6B7A" },
			{ name: "green", hex: "#6CDB9A" },
			{ name: "gold", hex: "#FFD166" },
			{ name: "sky", hex: "#67C7FF" },
		],
	},
	{
		id: "debug",
		label: "Debug",
		bundled: true,
		swatches: [
			{ name: "blue", hex: "#0057B8" },
			{ name: "orange", hex: "#FC4C02" },
			{ name: "beige", hex: "#E0C6AD" },
			{ name: "charcoal", hex: "#253746" },
			{ name: "teal", hex: "#00968F" },
		],
	},
	{
		id: "exception",
		label: "Exception",
		bundled: true,
		swatches: [
			{ name: "red", hex: "#C8102E" },
			{ name: "teal", hex: "#00968F" },
			{ name: "cream", hex: "#DDCBA4" },
			{ name: "charcoal", hex: "#1D252D" },
			{ name: "pink", hex: "#E0457B" },
		],
	},
	{
		id: "merge",
		label: "Merge",
		bundled: true,
		swatches: [
			{ name: "emerald", hex: "#007D63" },
			{ name: "green", hex: "#154734" },
			{ name: "gold", hex: "#C6A15B" },
			{ name: "yellow", hex: "#FFB81C" },
			{ name: "teal", hex: "#2DCCD3" },
		],
	},
	{
		id: "refactor",
		label: "Refactor",
		bundled: true,
		swatches: [
			{ name: "terracotta", hex: "#C4704E" },
			{ name: "teal", hex: "#00968F" },
			{ name: "magenta", hex: "#CE0F69" },
			{ name: "beige", hex: "#E0C6AD" },
			{ name: "charcoal", hex: "#3F2021" },
		],
	},
	{
		id: "legacy",
		label: "Legacy",
		bundled: true,
		swatches: [
			{ name: "beige", hex: "#E0C6AD" },
			{ name: "orange", hex: "#FC4C02" },
			{ name: "brown", hex: "#8C6239" },
			{ name: "olive", hex: "#5E6738" },
			{ name: "red", hex: "#C8102E" },
		],
	},
	{
		id: "syntax",
		label: "Syntax",
		bundled: true,
		swatches: [
			{ name: "aqua", hex: "#4EC6C0" },
			{ name: "magenta", hex: "#CE0F69" },
			{ name: "emerald", hex: "#007D63" },
			{ name: "lime", hex: "#00B140" },
			{ name: "charcoal", hex: "#1D252D" },
		],
	},
	{
		id: "production",
		label: "Production",
		bundled: true,
		swatches: [
			{ name: "burgundy", hex: "#651C32" },
			{ name: "beige", hex: "#E0C6AD" },
			{ name: "gold", hex: "#C6A15B" },
			{ name: "red", hex: "#A6192E" },
			{ name: "charcoal", hex: "#1D252D" },
		],
	},
	{
		id: "pipeline",
		label: "Pipeline",
		bundled: true,
		swatches: [
			{ name: "red", hex: "#C8102E" },
			{ name: "teal", hex: "#4FA8B5" },
			{ name: "charcoal", hex: "#1D252D" },
			{ name: "cream", hex: "#DDCBA4" },
			{ name: "orange", hex: "#CF4520" },
		],
	},
	{
		id: "deploy",
		label: "Deploy",
		bundled: true,
		swatches: [
			{ name: "gold", hex: "#C6A15B" },
			{ name: "burgundy", hex: "#651C32" },
			{ name: "green", hex: "#154734" },
			{ name: "teal", hex: "#1A6B7A" },
			{ name: "magenta", hex: "#CE0F69" },
		],
	},
];

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
