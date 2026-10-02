# pi-usage

[![pi-usage — for PI Agent](https://raw.githubusercontent.com/prjct-app/pi-local-extensions/main/pi-usage/docs/cover-v2.png)](https://pi.dev)

How many tokens you used, and the **subsidy**: what that same use would cost at API list price. Covers this session, this project and every project. `/usage` opens the shared docked panel.

The line above the editor always shows what this session and this project cost so far, for example `$0.05 session · $277.74 project`. It sits dim at the right of the shared mode line. Each reply updates it as soon as it lands. The folder's other sessions are reread in the background after startup and at most every 30s. `/usage off` hides the line, and `/usage on` brings it back. The choice holds for every session and is saved in `~/.prjct/pi-usage/settings.json`.

It never reaches the model. It registers no tools, sends no messages, adds no prompt hooks and writes nothing to the session. It reads the session files Pi already writes, and keeps its own cache in `~/.prjct/pi-usage/`.


## Install

Requires Pi and Node.js 22.19+. Install the package, then reload Pi:

```sh
pi install npm:@prjct.app/pi-usage
```

The shared TUI library (`@prjct.app/pi-tui-kit`) is installed automatically as a runtime dependency. No separate kit or `pi-ui` installation is required for the cost line or the `/usage` panel.

## What each part is for

| Part | What it is for |
| --- | --- |
| **This session** | The live session, read from memory, plus the subagent runs it launched. |
| **Project** | Every session started in this folder, with their subagent runs. It is the same identity as Pi's session folder for the working directory. |
| **All projects** | Every session and subagent run on this machine. **By project** ranks the folders. |
| Session rows | One per session in this project, newest first. The label is its `/name`, else its ticket, else how its first prompt starts. |
| **By model · subsidy** | The subsidy per model and its total. |
| **By kind** | Replies, subagent calls, compactions and cache warms. |
| **Tickets** | Sessions that share a ticket, added together: Jira keys, or links to Jira, Linear, ClickUp, GitHub issues and PRs, Google Docs and Notion. |
| **priced** | How much Pi recorded, how much is an OpenRouter list-price estimate, and how many tokens have no price. |

## Where the numbers come from

- **Pi records the list-price cost** of every reply (`usage.cost`), so most of the subsidy is read as-is.
- **Some models get no price from Pi** and are recorded at $0, for example a custom provider. Those tokens are priced from the OpenRouter catalog, which is cached for 24h. Models are matched by name, and the provider's first word is tried as a prefix: `kimi-coding/k3-256k` → `moonshotai/kimi-k3`.
- **No price, no guess.** Tokens with no price anywhere are shown as unpriced. Free models and local runtimes are $0.
- **A fork does not count its parent again.** Copied entries keep their original time, so anything older than the fork is skipped.
- **Every branch counts**, because every branch was paid for.

## Recipes

- **What did this ticket cost?** Run `/usage project`, then type `/` and the ticket key in the panel's search.
- **Which model gives the most subsidy?** Run `/usage global` and read **By model · subsidy**.
- **The numbers look stale.** Press `r` in the panel. It rereads changed files and refreshes list prices.
- **Without the TUI** (print, RPC), `/usage` prints the same rows as text, followed by the models.

License: [MIT](LICENSE).
