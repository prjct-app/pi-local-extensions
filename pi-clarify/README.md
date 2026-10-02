# pi-clarify

[![pi-clarify — for PI Agent](https://raw.githubusercontent.com/prjct-app/pi-local-extensions/main/pi-clarify/docs/cover-v2.png)](https://pi.dev)

Interactive clarification panel for Pi. The model calls `clarify` with a short batch of single-choice, multiple-choice, or free-text questions. Every choice question identifies its most viable option, which the panel marks as `(recomendada)` without changing the recorded answer. The panel shows progress, supports revising answers, requires explicit submission, and returns all answers to the agent. Esc cancels without recording decisions. `/clarify <question>` opens a single free-text question manually and submits the answer as a follow-up user message.

Only interactive TUI mode can show the panel; other modes fail promptly.

## Development

From the repository root: `node scripts/build-pi.mjs pi-clarify`.

## Install

Requires Pi and Node.js 22.19+. Install the package, then reload Pi:

```sh
pi install npm:@prjct.app/pi-clarify
```


License: [MIT](LICENSE).
