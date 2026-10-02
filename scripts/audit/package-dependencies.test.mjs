import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assertRegistryLockfile, assertRuntimeDependencies } from "./package-dependencies.mjs";

function fixture(t, files, manifest = {}) {
  const root = mkdtempSync(join(tmpdir(), "pi-dependency-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content);
  return () => assertRuntimeDependencies(root, { name: "fixture", pi: { extensions: ["./index.ts"] }, ...manifest });
}

test("a missing shared kit is rejected even if installed for development", t => {
  const check = fixture(t, { "index.ts": "import { setFact } from '@prjct.app/pi-tui-kit';" }, {
    devDependencies: { "@prjct.app/pi-tui-kit": "^0.3.1" },
  });
  assert.throws(check, /undeclared runtime dependency: @prjct.app\/pi-tui-kit/);
});

test("a normal runtime dependency can install the shared kit automatically", t => {
  const check = fixture(t, { "index.ts": "import { setFact } from '@prjct.app/pi-tui-kit';" }, {
    dependencies: { "@prjct.app/pi-tui-kit": "^0.3.1" },
  });
  assert.equal(check(), 1);
});

test("runtime imports in relative modules and literal dynamic imports are checked", t => {
  const check = fixture(t, { "index.ts": "import './detail.ts';", "detail.ts": "const module = import('missing-package');" });
  assert.throws(check, /undeclared runtime dependency: missing-package/);
});

test("a host peer is allowed but bundling a host copy is rejected", t => {
  const source = { "index.ts": "import { Text } from '@earendil-works/pi-tui';" };
  assert.equal(fixture(t, source, { peerDependencies: { "@earendil-works/pi-tui": "*" } })(), 1);
  assert.throws(fixture(t, source, { dependencies: { "@earendil-works/pi-tui": "*" } }), /host package must be a peer/);
});

test("comments, code strings, builtin modules, and type-only imports are not runtime packages", t => {
  const check = fixture(t, { "index.ts": `
    import type { Model } from 'types-only';
    import { join } from 'node:path';
    // import 'comment-package';
    const example = "import('example-package')";
  ` });
  assert.equal(check(), 1);
});

test("a missing relative module cannot hide in a source tarball", t => {
  assert.throws(fixture(t, { "index.ts": "export * from './missing.ts';" }), /shipped relative import missing/);
});

test("a registry dependency cannot retain a sibling checkout in its lockfile", () => {
  const manifest = { name: "fixture", dependencies: { "@prjct.app/pi-tui-kit": "^0.3.1" } };
  assert.throws(() => assertRegistryLockfile(manifest, {
    packages: { "node_modules/@prjct.app/pi-tui-kit": { resolved: "../pi-tui-kit", link: true } },
  }), /local link in public lockfile/);
  assert.doesNotThrow(() => assertRegistryLockfile(manifest, {
    packages: { "node_modules/@prjct.app/pi-tui-kit": {
      version: "0.3.1", resolved: "https://registry.npmjs.org/@prjct.app/pi-tui-kit/-/pi-tui-kit-0.3.1.tgz",
    } },
  }));
});

test("lockfiles must contain every declared runtime dependency", () => {
  assert.throws(() => assertRegistryLockfile({ name: "fixture", dependencies: { missing: "^1.0.0" } }, {
    packages: {},
  }), /runtime dependency absent from lockfile: missing/);
});
