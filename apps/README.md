# BIG RPJ Apps

Three personal apps served by GitHub Pages:

- `training/` RPJ Training Arc
- `cissp/` CISSP 100 Refresh
- `fuel/` Fuel & Consistency

## How it fits together

```
 Browser (GitHub Pages)  ──►  rpj-relay (Cloudflare Worker)  ──►  Anthropic API
        │  passcode header            │  holds ANTHROPIC_API_KEY (secret)
        └─────────── progress ───────►│  Cloudflare KV (your saved data)
```

- **No secrets in this repo.** The Anthropic key and the app passcode live only in the Worker as encrypted secrets.
- The Worker only answers requests from `https://rob23238.github.io` that carry the right passcode.
- `rpj-shim.js` gives the apps the same `window.claude.use("sample" | "db" | "user")` calls they had inside Claude, routed to the relay.
- Output length, model choice and request size are capped in the Worker. Set a monthly spend limit on the API key too.

## Worker setup (one time)

See `worker/worker.js`. In Cloudflare: create a Worker named `rpj-relay`, paste the file, add secrets `ANTHROPIC_API_KEY` and `APP_PASS`, add variable `ALLOWED_ORIGIN = https://rob23238.github.io`, and bind a KV namespace as `DATA`.
