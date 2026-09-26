import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { PALETTE_IDS } from "./palettes.ts";

const FAVORITES_PATH = join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"), "palette-favorites.json");
const knownIds = new Set(PALETTE_IDS);

export function readFavorites(path = FAVORITES_PATH): Set<string> {
	let data: unknown;
	try {
		data = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return new Set();
		throw error;
	}
	if (!Array.isArray(data) || !data.every((id: unknown) => typeof id === "string")) {
		throw new Error("Invalid palette favorites file");
	}
	return new Set(data.filter((id: string) => knownIds.has(id)));
}

export function toggleFavorite(id: string, path = FAVORITES_PATH): Set<string> {
	if (!knownIds.has(id)) throw new Error(`Unknown palette: ${id}`);
	const favorites = readFavorites(path);
	if (favorites.has(id)) favorites.delete(id);
	else favorites.add(id);
	mkdirSync(dirname(path), { recursive: true });
	const temp = `${path}.${randomUUID()}.tmp`;
	try {
		writeFileSync(temp, `${JSON.stringify([...favorites])}\n`);
		renameSync(temp, path);
	} catch (error) {
		try { unlinkSync(temp); } catch { /* No temporary file to remove. */ }
		throw error;
	}
	return favorites;
}
