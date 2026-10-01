# Extension audit

Three scripts. Together they give a baseline per extension, and the same commands measure it again after a change.

| Script | What it measures | Source |
| --- | --- | --- |
| `context-payloads.mjs` | Fixed context per request: tool schemas, the tool's line in `<tools>`, its rules | Exact payloads saved by pi-trace-logger (`~/Desktop/pi-logs`) |
| `sessions.mjs` | Dynamic context, and reliability | Session files, including pi-subagents children |
| `perf.mjs` | Startup cold and warm, idle CPU, disk, build size | Spawns `pi --mode rpc --no-session` in a scratch agent dir. No model is called. |

`sessions.mjs` covers:
- **Dynamic context:** messages each extension injects, its tool results, and the tool arguments the model writes.
- **Reliability:** failed calls by cause, identical calls repeated back to back, self_compact notes saved without a compaction, and automated turns that only relayed or acknowledged a message.

```
node scripts/audit/context-payloads.mjs --days 7 --out ~/.prjct/audit/<date>/context-payloads.json
node scripts/audit/sessions.mjs --days 7 --out ~/.prjct/audit/<date>/sessions.json
node scripts/audit/perf.mjs --runs 5 --idle 60 --out ~/.prjct/audit/<date>/perf.json
```

Every tool and message type is attributed through `owners.mjs`. Add new ones there when they ship.

Startup is measured warm (a fixed path, Pi's load cache hit) and cold (the first start after a rebuild). Each extension is timed alone against bare Pi in the same round, so load drift hits every configuration alike.
