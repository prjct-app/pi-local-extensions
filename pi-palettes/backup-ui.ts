import { ago, type PanelDetail, type PanelItem, type PanelSpec, type Tone } from "@prjct.app/pi-tui-kit";
import { KEEP, WEEK_MS, listVersions, readState, readVersion, type BackupReason, type BackupState } from "./backup.ts";
import type { CloudVersion } from "./cloud.ts";

/** The fact name on the shared mode line. */
export const FACT = "palette-backup";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "in 5d", "in 3h", "now": when the weekly check runs next. */
export function nextCheck(state: BackupState, now = Date.now()): string {
	if (state.checkedAt === undefined) return "now";
	const left = state.checkedAt + WEEK_MS - now;
	if (left <= 0) return "now";
	const hours = Math.ceil(left / 3_600_000);
	return hours < 48 ? `in ${hours}h` : `in ${Math.ceil(hours / 24)}d`;
}

/** The short line on the mode line: when the last backup ran and what each side keeps. */
export function factText(state: BackupState, localCount: number, connected: boolean, running: boolean, now = Date.now()): string {
	if (running) return "palette backup…";
	if (state.checkedAt === undefined) return "palette backup pending";
	const parts = [`palette backup ${ago(state.checkedAt, now)}`, `${localCount} local`];
	if (connected) parts.push(state.cloudError ? "cloud ✕" : state.cloudCount !== undefined ? `${state.cloudCount} cloud` : "cloud —");
	return parts.join(" · ");
}

export function when(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso || "—";
	return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

const WHY: Record<BackupReason, string> = { weekly: "weekly check", manual: "backed up by hand", connect: "first backup after connecting", restore: "saved before a restore" };

export type BackupPanelOptions = {
	connected: boolean;
	cloud: () => CloudVersion[];
	/** Why the cloud list could not be read, if it could not. */
	cloudProblem: () => string | undefined;
	/** Run a backup now; returns the line to show under the list. */
	backupNow: () => Promise<{ text: string; tone: Tone }>;
	/** Restore after the panel closes (Pi reloads). */
	restore: (id: string) => void;
	site: string;
};

/** The backups panel: every version on this computer and on pi-themes. */
export function backupPanel(options: BackupPanelOptions): PanelSpec {
	const local = () => listVersions();
	return {
		title: "Palette backups",
		summary: () => {
			const parts = [`${local().length}/${KEEP} local`];
			if (options.connected) parts.push(options.cloudProblem() ? "cloud unavailable" : `${options.cloud().length}/${KEEP} cloud`);
			parts.push(`next check ${nextCheck(readState())}`);
			return parts.join(" · ");
		},
		items: (): PanelItem[] => [
			...local().map((v) => ({
				id: `local:${v.file}`,
				label: when(v.createdAt),
				meta: `local · ${plural(v.palettes.length, "palette")}`,
				search: `local ${v.reason} ${v.palettes.join(" ")}`,
			})),
			...options.cloud().map((v) => ({
				id: `cloud:${v.id}`,
				label: when(v.createdAt),
				meta: `cloud · ${plural(v.palettes, "palette")}`,
				search: `cloud ${v.client ?? ""}`,
			})),
		],
		detail: (item): PanelDetail => {
			const [side, key = ""] = item.id.split(/:(.*)/s);
			if (side === "cloud") {
				const v = options.cloud().find((c) => c.id === key);
				return {
					title: item.label,
					subtitle: `On ${options.site}`,
					fields: [
						{ label: "Saved", value: v ? `${when(v.createdAt)} (${ago(Date.parse(v.createdAt))})` : "—" },
						{ label: "From", value: v?.client ?? "—" },
						{ label: "Palettes", value: String(v?.palettes ?? 0) },
						{ label: "Favorites", value: String(v?.favorites ?? 0) },
					],
					sections: [{ title: "Restore", lines: ["Press r twice to replace your library and favorites with this version. Your current library is saved here first."] }],
				};
			}
			try {
				const v = readVersion(key);
				return {
					title: item.label,
					subtitle: "On this computer",
					fields: [
						{ label: "Saved", value: `${when(v.createdAt)} (${ago(Date.parse(v.createdAt))})` },
						{ label: "Why", value: WHY[v.reason] },
						{ label: "Palettes", value: String(v.local.palettes.length) },
						{ label: "Favorites", value: String(v.local.favorites?.length ?? 0) },
						{ label: "Active", value: v.local.active ?? "—" },
						{ label: "Cloud copy", value: v.cloud ? `${plural(v.cloud.palettes.length, "palette")}${v.user ? ` from @${v.user}` : ""}` : "not connected then", tone: v.cloud ? undefined : "dim" },
					],
					sections: [
						{ title: "Your palettes", lines: v.local.palettes.slice(0, 40).map((p) => `${p.label}  ${p.id}`) },
						{ title: "Restore", lines: ["Press r twice to replace your library and favorites with this version. Your current library is saved here first."] },
					],
				};
			} catch (error) {
				return { title: item.label, subtitle: `Could not read this backup: ${error instanceof Error ? error.message : String(error)}`, subtitleTone: "error" };
			}
		},
		actions: [
			{
				key: "b",
				label: "Back up now",
				bulk: true,
				run: async (_item, panel) => {
					panel.notice("Backing up…", "muted");
					const { text, tone } = await options.backupNow();
					panel.refresh();
					panel.notice(text, tone);
				},
			},
			{
				key: "r",
				label: "Restore",
				when: (item) => item !== undefined,
				confirm: true,
				run: (item, panel) => {
					if (!item) return;
					options.restore(item.id);
					panel.close();
				},
			},
		],
		empty: "No backups yet. Press b to back up now.",
	};
}
