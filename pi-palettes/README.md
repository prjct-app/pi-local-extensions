# pi-palette

[![pi-palette — for PI Agent](https://raw.githubusercontent.com/prjct-app/pi-local-extensions/main/pi-palettes/docs/cover-v2.png)](https://pi.dev)

34 color themes for Pi, with live preview, favorites, synchronization between open sessions, weekly versioned backups, and your own library from [pi-themes](https://palette.prjct.app).

## Install

Requires Pi and Node.js 22.19+:

```sh
pi install npm:@prjct.app/pi-palette
```

Reload Pi to discover the themes.

## Use

- `/palette` opens the picker. Categories on the left (Favorites, Your palettes, Editor classics, From photos, Originals, Backups, Account); the highlighted category's list on the right. `→` opens a category: its list moves left and the selected item's details show on the right, with a live preview for palettes. Each category brings its own keys: `f` favorite and `a` apply for palettes, `b` back up now and `r` restore for backups, `s` sync, `l` log in/out, `i` import and `e` export for the account.
- `/palette <id>` applies a named palette, for example `/palette nord`.
- `/palette next`, `/palette prev`, and `/palette random` change palettes directly.

The picker groups your own palettes, editor-inspired, photo-inspired and original palettes. Favorites persist locally. The active palette is shared across open Pi windows through a local state file. Preview requires interactive terminal mode; named changes also work without the picker.

## Your library

Palettes are data. The package ships `palettes.json` (the official set), and your own library lives in `~/.pi/agent/pi-palette/library.json`. Theme files are generated from both into Pi's themes folder, `~/.pi/agent/themes/`, each time Pi loads: Pi applies the theme in your settings before extensions run, so the files must already be there. The extension lists the files it wrote in `~/.pi/agent/pi-palette/owned-themes.json` and only ever rewrites or removes those; a theme of your own with the same name is left alone and wins.

There are two ways to bring palettes in.

**By file, fully offline**

- `/palette import [file]` replaces your library and favorites with a `library.json` downloaded from pi-themes (default: `~/Downloads/library.json`), then reloads.
- `/palette export [file]` writes your palettes, favorites and the active palette to a file (default: `~/Downloads/pi-palette-export.json`) that pi-themes can import.

pi-themes also offers a prompt that tells Pi to write `library.json` for you; run `/reload` afterwards.

**By account, only when you ask**

- `/palette login` shows a short code and opens pi-themes. Approve it there while signed in. Pi then keeps a token in `~/.pi/agent/pi-palette/auth.json` (readable only by you).
- `/palette sync` sends your palettes and favorites to pi-themes, brings your library back, and reloads.
- `/palette logout` revokes the token and deletes it from this computer.

The token can only read and write your palette library: no email, no other account data. The extension only talks to the pi-themes API (never to its database), only over HTTPS, and only while connected: during `login`, `sync`, `logout`, `backup` and `backups`, and for the weekly backup. Without a token it never reaches the network. You can also disconnect any Pi from your library page on the site. Set `PI_THEMES_URL` to point at another pi-themes deployment.

## Backups

Every time Pi starts, the extension checks whether a week has passed since the last backup. If it has, it backs up in the background; otherwise it does nothing until next week.

- **On this computer**, always: `~/.pi/agent/pi-palette/backups/` keeps the last 10 versions of your library (your palettes, favorites and the active palette). Fully offline; no account needed.
- **On pi-themes**, while this Pi is connected: the same library is saved there too, and pi-themes keeps its last 10 versions. What pi-themes holds is also copied into the local version, so each side has a copy of the other.
- A version identical to the newest one is not saved again, so ten unchanged weeks never push out your history.
- If the cloud cannot be reached, the local backup still happens and you are told why the cloud part failed.

The `/palette` picker shows the backup state and next weekly check under Account and Backups. Palette does not add a permanent status to the composer.

- `/palette backup` backs up now, whatever the weekly clock says.
- `/palette backups` opens the picker on Backups: every version, here and on pi-themes. `b` backs up now; `r` (pressed twice) restores the selected version, after saving your current library as a version of its own so the restore can be undone.

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
