# pi-unescape

[![pi-unescape — for PI Agent](https://raw.githubusercontent.com/prjct-app/pi-local-extensions/main/pi-unescape/docs/cover-v2.png)](https://pi.dev)

Some models write accents in tool arguments as literal escapes: `c\u00f3digo` instead of `código`. Once one lands in the transcript, the model copies it, and every later reply and team message shows escapes.

This decodes them where people read prose:

| Hook | What it is for |
| --- | --- |
| `tool_call` | The tool runs with decoded text, so the reply, team message or report is delivered and shown with accents. |
| `message_end` | The stored assistant message gets the same fix, so the model never sees the escapes again and stops copying them. |


## Install

Requires Pi and Node.js 22.19+. Install the package, then reload Pi:

```sh
pi install npm:@prjct.app/pi-unescape
```

## Scope

- **Only prose tools:** `answer`, `team_message`, `agent_reply`, subagent and QA reports, `ask_jev`, `self_compact`, `memory_record`, `proto_reply`. The list is `PROSE_TOOLS` in `index.ts`; add a tool there when it carries prose.
- **Never code tools:** `edit`, `write`, `bash`, or delegations. In code an escape can be the point.
- **Only non-ASCII escapes.** `\u0022`, an escaped backslash (`\\u00f3`) and lone surrogates stay as written.

License: [MIT](LICENSE).
