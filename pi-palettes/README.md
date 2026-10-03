# pi-palette

[![pi-palette — for PI Agent](https://raw.githubusercontent.com/prjct-app/pi-local-extensions/main/pi-palettes/docs/cover-v2.png)](https://pi.dev)

34 color themes for Pi, with live preview, favorites, synchronization between open sessions, and your own library from [pi-themes](https://palette.prjct.app).

## Install

Requires Pi and Node.js 22.19+:

```sh
pi install npm:@prjct.app/pi-palette
```

Reload Pi to discover the themes.

## Use

- `/palette` opens the interactive picker and previews the selected palette.
- `/palette <id>` applies a named palette, for example `/palette nord`.
- `/palette next`, `/palette prev`, and `/palette random` change palettes directly.

The picker groups your own palettes, editor-inspired, photo-inspired and original palettes. Favorites persist locally. The active palette is shared across open Pi windows through a local state file. Preview requires interactive terminal mode; named changes also work without the picker.

## Your library

Palettes are data. The package ships `palettes.json` (the official set), and your own library lives in `~/.pi/agent/pi-palette/library.json`. Theme files are generated from both into `~/.pi/agent/pi-palette/themes/` each time Pi loads. Nothing is fetched while Pi runs.

There are two ways to bring palettes in.

**By file, fully offline**

- `/palette import [file]` replaces your library and favorites with a `library.json` downloaded from pi-themes (default: `~/Downloads/library.json`), then reloads.
- `/palette export [file]` writes your palettes, favorites and the active palette to a file (default: `~/Downloads/pi-palette-export.json`) that pi-themes can import.

pi-themes also offers a prompt that tells Pi to write `library.json` for you; run `/reload` afterwards.

**By account, only when you ask**

- `/palette login` shows a short code and opens pi-themes. Approve it there while signed in. Pi then keeps a token in `~/.pi/agent/pi-palette/auth.json` (readable only by you).
- `/palette sync` sends your palettes and favorites to pi-themes, brings your library back, and reloads.
- `/palette logout` revokes the token and deletes it from this computer.

The token can only read and write your palette library: no email, no other account data. The extension only talks to the pi-themes API (never to its database), only over HTTPS, and only during `login`, `sync` and `logout`. You can also disconnect any Pi from your library page on the site. Set `PI_THEMES_URL` to point at another pi-themes deployment.

### Library format

```json
{
  "format": "pi-palette",
  "version": 1,
  "active": "dracula",
  "favorites": ["dracula", "nord"],
  "palettes": [
    { "id": "sunrise", "label": "Sunrise", "vars": { "canvas": "#101010", "text": "#F0F0F0", "accent": "#FF8800", "secondary": "#00AAFF", "highlight": "#FF44AA", "success": "#44DD88", "warning": "#FFCC00", "error": "#FF4455" } }
  ]
}
```

`vars` needs at least the eight roles above (`#RRGGBB`). Optional: `swatches`, `colors` (only the roles that differ from the default mapping) and `export`. Imported files are validated and cleaned; anything else is dropped.

## Development

From the repository root:

```sh
node scripts/build-pi.mjs pi-palettes
```

Run `npm test` in this package. License: [MIT](LICENSE).
