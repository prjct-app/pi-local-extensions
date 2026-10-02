#!/usr/bin/env node
// Inspect real npm tarballs, including the covers and README installation paths.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const repositories = [
  "pi-ui", "pi-markdown", "pi-clipboard", "pi-plan", "pi-mcp", "pi-subagents",
  "pi-memory", "pi-team", "pi-qa", "pi-answer", "pi-secrets", "pi-proto",
  "pi-self-compact", "pi-tui-kit",
];
const localRoot = join(workspace, "local-extensions");
const localPackages = readdirSync(localRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && existsSync(join(localRoot, entry.name, "package.json")))
  .map(entry => join(localRoot, entry.name));
const packages = [...repositories.map(name => join(workspace, name)), ...localPackages];
const destination = mkdtempSync(join(tmpdir(), "pi-gallery-packages-"));
const results = [];
const failures = [];

function checkLinks(readme, packedRoot) {
  for (const [, target] of readme.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^(?:[a-z]+:|#|\/\/)/i.test(target)) continue;
    const path = decodeURIComponent(target.split("#")[0]);
    assert.ok(existsSync(resolve(packedRoot, path)), `README target missing from tarball: ${target}`);
  }
}

for (const packageRoot of packages) {
  try {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    // The foundation must exercise its prepack build. Extension tarballs ship source.
    const args = ["pack", "--json", "--pack-destination", destination];
    if (manifest.name !== "@prjct.app/pi-tui-kit") args.push("--ignore-scripts");
    const [packed] = JSON.parse(execFileSync("npm", args, { cwd: packageRoot, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }));
    const tarball = join(destination, packed.filename);
    const unpacked = mkdtempSync(join(destination, "contents-"));
    execFileSync("tar", ["-xzf", tarball, "-C", unpacked]);
    const packedRoot = join(unpacked, "package");
    const paths = new Set(packed.files.map(file => file.path));
    const readme = readFileSync(join(packedRoot, "README.md"), "utf8");
    assert.ok(paths.has("LICENSE"), `${manifest.name}: missing license`);
    checkLinks(readme, packedRoot);
    assert.notEqual(manifest.private, true, `${manifest.name}: private package`);
    assert.equal(manifest.publishConfig?.access, "public", `${manifest.name}: publish access`);
    assert.ok(manifest.repository?.url, `${manifest.name}: repository metadata`);
    for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
      assert.ok(!/^(?:file:|link:|workspace:)/.test(version), `${manifest.name}: local dependency ${name}`);
    }
    const coverPath = manifest.pi?.image
      ? `docs/${new URL(manifest.pi.image).pathname.split("/docs/").at(-1)}`
      : "docs/cover.png";
    assert.ok(paths.has(coverPath), `${manifest.name}: gallery asset missing from tarball: ${coverPath}`);
    const cover = readFileSync(join(packedRoot, coverPath));
    assert.equal(cover.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${manifest.name}: PNG signature`);
    assert.deepEqual([cover.readUInt32BE(16), cover.readUInt32BE(20)], [1536, 1024], `${manifest.name}: cover dimensions`);
    if (manifest.pi) {
      assert.ok(manifest.keywords.includes("pi-package"));
      assert.ok(manifest.pi.image?.startsWith("https://"));
      assert.ok(readme.includes(manifest.pi.image), `${manifest.name}: README and gallery cover differ`);
      assert.ok(readme.includes(`pi install npm:${manifest.name}`), `${manifest.name}: installation command`);
      for (const kind of ["extensions", "themes", "skills", "prompts"]) {
        for (const entry of manifest.pi[kind] ?? []) {
          assert.ok(existsSync(join(packedRoot, entry)), `${manifest.name}: missing ${kind} ${entry}`);
        }
      }
    } else {
      assert.equal(manifest.name, "@prjct.app/pi-tui-kit");
      assert.ok(paths.has("dist/index.js") && paths.has("dist/index.d.ts"));
      assert.ok(!manifest.keywords?.includes("pi-package"), "Library must not masquerade as an extension");
    }
    assert.ok(!paths.has(".env") && !paths.has("auth.json"), `${manifest.name}: private configuration`);
    results.push({ name: manifest.name, tarball, files: paths.size });
    console.log(`${manifest.name}: ${paths.size} files, README + cover + manifest OK`);
  } catch (error) {
    const failure = `${packageRoot}: ${error instanceof Error ? error.message : String(error)}`;
    failures.push(failure);
    console.error(failure);
  }
}
writeFileSync(join(destination, "results.json"), JSON.stringify({ packages: results, failures }, null, 2));
console.log(`Verified ${results.length}/${packages.length} packages. Tarballs: ${destination}`);
process.exitCode = failures.length ? 1 : 0;
