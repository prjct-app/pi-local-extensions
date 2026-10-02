# pi-prompt-state

[![pi-prompt-state — for PI Agent](https://raw.githubusercontent.com/prjct-app/pi-local-extensions/main/pi-prompt-state/docs/cover-v2.png)](https://pi.dev)

Tell Herdr when a running Pi tool is waiting for a person to answer a terminal prompt.

## Install

Requires Pi with `ui_prompt_start` / `ui_prompt_end` events, Herdr Pi Tree, and Node.js 22.19+:

```sh
pi install npm:@prjct.app/pi-prompt-state
```

Reload Pi after installation. If Herdr already installed its managed prompt-state bridge, use that copy instead; loading both emits duplicate events.

## Behavior

- Registers nothing unless `HERDR_ENV=1`.
- Emits `herdr:blocked` with `active: true` when a prompt opens during tool execution, and `active: false` when the waiting span ends.
- Prompts from commands or independent widgets do not mark the agent blocked.
- Herdr's companion integration consumes these events. This package adds no commands, tools, or notifications of its own.

Removing the bridge leaves Herdr with its normal working/idle states.

## Development

From the repository root: `node scripts/build-pi.mjs pi-prompt-state`.

License: [MIT](LICENSE).
