import type { Palette } from "./palettes.ts";

// Canonical colors of well-known editor themes, plus the Claude Code terminal palette.
export const EDITOR_PALETTES: Palette[] = [
	{
		id: "dracula",
		label: "Dracula",
		bundled: true,
		swatches: [
			{ name: "purple", hex: "#BD93F9" },
			{ name: "pink", hex: "#FF79C6" },
			{ name: "cyan", hex: "#8BE9FD" },
			{ name: "green", hex: "#50FA7B" },
			{ name: "yellow", hex: "#F1FA8C" },
		],
	},
	{
		id: "onedark",
		label: "One Dark",
		bundled: true,
		swatches: [
			{ name: "blue", hex: "#61AFEF" },
			{ name: "violet", hex: "#C678DD" },
			{ name: "green", hex: "#98C379" },
			{ name: "gold", hex: "#E5C07B" },
			{ name: "rose", hex: "#E06C75" },
		],
	},
	{
		id: "tokyonight",
		label: "Tokyo Night",
		bundled: true,
		swatches: [
			{ name: "blue", hex: "#7AA2F7" },
			{ name: "magenta", hex: "#BB9AF7" },
			{ name: "cyan", hex: "#7DCFFF" },
			{ name: "green", hex: "#9ECE6A" },
			{ name: "red", hex: "#F7768E" },
		],
	},
	{
		id: "catppuccin",
		label: "Catppuccin",
		bundled: true,
		swatches: [
			{ name: "mauve", hex: "#CBA6F7" },
			{ name: "pink", hex: "#F5C2E7" },
			{ name: "blue", hex: "#89B4FA" },
			{ name: "green", hex: "#A6E3A1" },
			{ name: "peach", hex: "#FAB387" },
		],
	},
	{
		id: "nightowl",
		label: "Night Owl",
		bundled: true,
		swatches: [
			{ name: "periwinkle", hex: "#82AAFF" },
			{ name: "lavender", hex: "#C792EA" },
			{ name: "sand", hex: "#ECC48D" },
			{ name: "mint", hex: "#7FDBCA" },
			{ name: "tangerine", hex: "#F78C6C" },
		],
	},
	{
		id: "nord",
		label: "Nord",
		bundled: true,
		swatches: [
			{ name: "frost", hex: "#88C0D0" },
			{ name: "fjord", hex: "#81A1C1" },
			{ name: "moss", hex: "#A3BE8C" },
			{ name: "amber", hex: "#EBCB8B" },
			{ name: "aurora", hex: "#BF616A" },
		],
	},
	{
		id: "monokai",
		label: "Monokai",
		bundled: true,
		swatches: [
			{ name: "magenta", hex: "#FF6188" },
			{ name: "tangerine", hex: "#FC9867" },
			{ name: "lemon", hex: "#FFD866" },
			{ name: "lime", hex: "#A9DC76" },
			{ name: "aqua", hex: "#78DCE8" },
		],
	},
	{
		id: "gruvbox",
		label: "Gruvbox",
		bundled: true,
		swatches: [
			{ name: "mustard", hex: "#FABD2F" },
			{ name: "ember", hex: "#FE8019" },
			{ name: "olive", hex: "#B8BB26" },
			{ name: "seafoam", hex: "#8EC07C" },
			{ name: "plum", hex: "#D3869B" },
		],
	},
	{
		id: "claude",
		label: "Claude",
		bundled: true,
		swatches: [
			{ name: "clay", hex: "#D77757" },
			{ name: "periwinkle", hex: "#B1B9F9" },
			{ name: "planTeal", hex: "#48968C" },
			{ name: "jade", hex: "#4EBA65" },
			{ name: "bashPink", hex: "#FD5DB1" },
		],
	},
];
