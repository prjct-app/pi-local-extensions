# Pi local extensions

Independent Pi packages maintained in one repository. Each package has its own README, license, gallery cover, and npm manifest.

## Packages

Install a package with `pi install npm:<name>`, then reload Pi.

| Package | Purpose |
| --- | --- |
| [@prjct.app/pi-delivery](pi-delivery/README.md) | Acceptance criteria, evidence, reviews, and completion gates. |
| [@prjct.app/pi-prompt-state](pi-prompt-state/README.md) | Report blocked tool prompts to Herdr; inactive outside Herdr. |
| [@prjct.app/pi-fast-mode](pi-fast-mode/README.md) | Opt-in priority service tier for supported models. |
| [@prjct.app/pi-palettes](pi-palettes/README.md) | 34 themes, live preview, favorites, and window synchronization. |
| [@prjct.app/pi-context-prune](pi-context-prune/README.md) | Superseded memory pruning and provider cache controls. |
| [@prjct.app/pi-clarify](pi-clarify/README.md) | Structured choices and free-text questions in the terminal. |
| [@prjct.app/pi-jobs](pi-jobs/README.md) | Background commands and notifications when work changes. |
| [@prjct.app/pi-usage](pi-usage/README.md) | Token usage and estimated API list-price value. |
| [@prjct.app/pi-unescape](pi-unescape/README.md) | Decode non-ASCII escapes in prose tools without touching code. |

See each package's README for host requirements, defaults, and configuration. The root workspace is private on npm and is not an installable Pi package.

## Development

Requires Node.js 22.19+ and a sibling checkout of [pi-tui-kit](https://github.com/prjct-app/pi-tui-kit).

```sh
(cd ../pi-tui-kit && npm ci && npm run build)
npm ci
npm test
npm run build:pi
```

The build command writes compiled packages to `~/.pi/agent/builds`. Add only the packages you want to your Pi settings and restart Pi. npm installations load each declared TypeScript entry point directly; these local builds are not required for npm users.

Inspect an individual tarball with `npm run check:package` from its package directory. In the complete sibling-repository workspace, `node scripts/audit/packages.mjs` checks all 23 prospective packages, including README links, cover dimensions, Pi resources, and public runtime dependencies. Publish the shared kit before packages that depend on it. Packing is a check, not registry publication.
