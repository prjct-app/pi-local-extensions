import type { Palette } from "./palettes.ts";

// Colors sampled from the five swatches in each reference image (not Pantone specifications).
export const PHOTO_PALETTES: Palette[] = [
	{
		id: "glacier",
		label: "Glacier",
		bundled: true,
		swatches: [
			{ name: "ivory", hex: "#EEF0F8" },
			{ name: "sky", hex: "#9FCAF2" },
			{ name: "cobalt", hex: "#2A62C4" },
			{ name: "navy", hex: "#113068" },
			{ name: "sunflower", hex: "#F5CB4B" },
		],
	},
	{
		id: "ember",
		label: "Ember",
		bundled: true,
		swatches: [
			{ name: "orange", hex: "#ED8139" },
			{ name: "vermilion", hex: "#EA5831" },
			{ name: "oxblood", hex: "#8A1E2A" },
			{ name: "sage", hex: "#607E66" },
			{ name: "charcoal", hex: "#202022" },
		],
	},
	{
		id: "iris",
		label: "Iris",
		bundled: true,
		swatches: [
			{ name: "lilac", hex: "#C1B5DC" },
			{ name: "violet", hex: "#5B448A" },
			{ name: "midnight", hex: "#0E243E" },
			{ name: "ink", hex: "#131418" },
			{ name: "olive", hex: "#869546" },
		],
	},
	{
		id: "hearth",
		label: "Hearth",
		bundled: true,
		swatches: [
			{ name: "cream", hex: "#F2E9CC" },
			{ name: "peach", hex: "#F4CAA0" },
			{ name: "terracotta", hex: "#BC704A" },
			{ name: "brick", hex: "#A42A2B" },
			{ name: "coffee", hex: "#482B23" },
		],
	},
	{
		id: "atelier",
		label: "Atelier",
		bundled: true,
		swatches: [
			{ name: "cream", hex: "#F4E8CD" },
			{ name: "beige", hex: "#C7B59F" },
			{ name: "burgundy", hex: "#722138" },
			{ name: "orchid", hex: "#762F75" },
			{ name: "olive", hex: "#707246" },
		],
	},
	{
		id: "bloom",
		label: "Bloom",
		bundled: true,
		swatches: [
			{ name: "porcelain", hex: "#E2DFDC" },
			{ name: "rose", hex: "#CEA4B0" },
			{ name: "wine", hex: "#6B1E31" },
			{ name: "honey", hex: "#EDB64B" },
			{ name: "black", hex: "#121212" },
		],
	},
	{
		id: "tidepool",
		label: "Tidepool",
		bundled: true,
		swatches: [
			{ name: "turquoise", hex: "#5EC0C7" },
			{ name: "azure", hex: "#51AAE7" },
			{ name: "deepBlue", hex: "#1A4172" },
			{ name: "gold", hex: "#D9AF49" },
			{ name: "olive", hex: "#818B44" },
		],
	},
	{
		id: "orchard",
		label: "Orchard",
		bundled: true,
		swatches: [
			{ name: "lime", hex: "#B2D755" },
			{ name: "turquoise", hex: "#4CA2A5" },
			{ name: "slate", hex: "#607F91" },
			{ name: "coral", hex: "#EA6A53" },
			{ name: "burgundy", hex: "#7D233B" },
		],
	},
];
