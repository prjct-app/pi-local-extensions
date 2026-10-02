# pi-palettes

[![pi-palettes — for PI Agent](https://raw.githubusercontent.com/prjct-app/pi-local-extensions/main/pi-palettes/docs/cover-v2.png)](https://pi.dev)

34 color themes for Pi, with live preview, favorites, and synchronization between open sessions.

## Install

Requires Pi and Node.js 22.19+:

```sh
pi install npm:@prjct.app/pi-palettes
```

Reload Pi to discover the bundled themes.

## Use

- `/palette` opens the interactive picker and previews the selected palette.
- `/palette <id>` applies a named palette, for example `/palette nord`.
- `/palette next`, `/palette prev`, and `/palette random` change palettes directly.

The picker groups original, editor-inspired, and photo-inspired palettes. Favorites persist locally. The active palette is shared across open Pi windows through a local state file. Preview requires interactive terminal mode; named changes also work without the picker.

## Development

From the repository root:

```sh
node scripts/build-pi.mjs pi-palettes
```

Run `npm test` in this package. License: [MIT](LICENSE).
