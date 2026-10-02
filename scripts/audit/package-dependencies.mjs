import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const hostPackages = new Set([
  "@earendil-works/pi-ai", "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox",
]);
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, "")));

function moduleName(specifier) {
  return specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
}

function runtimeImports(source) {
  const imports = [];
  const visit = node => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

function resolveSource(importer, specifier) {
  const path = resolve(dirname(importer), specifier);
  return [path, `${path}.ts`, `${path}.js`, resolve(path, "index.ts"), resolve(path, "index.js")]
    .find(candidate => existsSync(candidate));
}

export function assertRegistryLockfile(manifest, lockfile) {
  for (const [path, entry] of Object.entries(lockfile.packages ?? {})) {
    assert.ok(!entry.link, `${manifest.name}: local link in public lockfile: ${path}`);
    if (entry.resolved) {
      assert.ok(!entry.resolved.startsWith("file:") && !entry.resolved.startsWith("../"),
        `${manifest.name}: local path in public lockfile: ${path}`);
    }
  }
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    const entry = lockfile.packages?.[`node_modules/${dependency}`];
    assert.ok(entry?.version, `${manifest.name}: runtime dependency absent from lockfile: ${dependency}`);
  }
}

/** Follow shipped runtime entry points; development scripts and type-only imports are not runtime dependencies. */
export function assertRuntimeDependencies(packageRoot, manifest) {
  const dependencies = manifest.dependencies ?? {};
  const peers = manifest.peerDependencies ?? {};
  for (const host of hostPackages) {
    assert.ok(!(host in dependencies), `${manifest.name}: host package must be a peer: ${host}`);
    if (host in peers) assert.equal(peers[host], "*", `${manifest.name}: host peer range: ${host}`);
  }
  const entries = manifest.pi?.extensions ?? [manifest.exports?.["."]?.default].filter(Boolean);
  const queue = entries.map(entry => resolve(packageRoot, entry));
  const seen = new Set();
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    for (const specifier of runtimeImports(source)) {
      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        const target = resolveSource(file, specifier);
        assert.ok(target, `${manifest.name}: shipped relative import missing: ${specifier}`);
        if (/\.(?:[cm]?[jt]s|tsx|jsx)$/.test(target)) queue.push(target);
        continue;
      }
      if (specifier.startsWith("node:") || builtins.has(specifier)) continue;
      const name = moduleName(specifier);
      assert.ok(name in dependencies || (hostPackages.has(name) && name in peers),
        `${manifest.name}: undeclared runtime dependency: ${name}`);
    }
  }
  return seen.size;
}
