import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimeManifest } from "./audit-production.mjs";

test("the audit includes normal and optional runtime dependencies, but not host peers or development tools", () => {
  const runtime = { "@prjct.app/pi-tui-kit": "^0.3.1" };
  const optional = { "native-helper": "^1.0.0" };
  assert.deepEqual(runtimeManifest({
    name: "@prjct.app/pi-usage", dependencies: runtime, optionalDependencies: optional,
    peerDependencies: { "@earendil-works/pi-coding-agent": "*" },
    devDependencies: { "@earendil-works/pi-coding-agent": "1.0.0" },
    scripts: { prepare: "never executed by the audit" },
  }), { name: "pi-runtime-security-audit", private: true, dependencies: runtime, optionalDependencies: optional });
});

test("invalid dependency maps cannot become an npm installation request", () => {
  assert.throws(() => runtimeManifest(null), /Expected a named npm package/);
  assert.throws(() => runtimeManifest({ name: "fixture", dependencies: [] }), /Invalid dependencies/);
  assert.throws(() => runtimeManifest({ name: "fixture", dependencies: { library: 12 } }), /Invalid dependencies/);
});
