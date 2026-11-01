# Independent-review repairs

## Outcome

All four original findings addressed in source; private deployment remains gated pending independent final-source review and target-host checks. No Strix deployment, external service calls, vault mutation, real-data edits, or preview process restart performed. Existing preview process therefore still holds its old server code; parent must perform the app-scoped restart to test this server revision. UI assets are read from disk and may already show new wording. First restart upgrades session auth and signs out legacy cookies once.

## Changes

- Material handoff edits reopen awaiting_manual, clear active evidence, and atomically archive the entire previous record in reopen:jobs audit. Same-request completion cannot override reopening; no-op edits preserve completion.
- Private session-secret plus password-derived fingerprint revokes persisted cookies after credential rotation/restart. Normal restart preserves sessions. No secret values are exposed in API/log evidence.
- One optional exact HTTPS external origin and exact Host allowlist; forwarded headers ignored. Secure cookies in TLS external mode; default loopback unchanged and backend always loopback-only.
- Explicit UI capability section: Argus not connected; automatic execution disabled; Agent Zero API tested separately, not dashboard integrated; desktop :120 unavailable/not verified, pending separate repair evidence.
- Dockerfile, allowlist .dockerignore, Linux host-network Compose/private-bind Caddy templates and deployment/backup/Bitwarden organization handoff instructions.

## Executed evidence

- review-red.txt: all three new regression groups failed on the original implementation for the expected defects.
- review-green.txt: four Node HTTP integration groups passed, zero failures. Actual child-process restart, material field changes/no-op, full long audit evidence, password rotation and fresh login, HTTPS proxy positive/negative Host/Origin paths and Secure cookie.
- review-browser.json: Chromium workflow passed, no page errors, 390x844 and 1440x1000; completion -> material edit -> pending, cleared evidence, capability labels, upload/version/reviews and mobile sections.
- independent-regression-results.json: original independent reviewer probe adapted only for current source path/output and repaired expectations; freshly passed including 320x740 DOM checks, Host/Origin/CSRF denials, reopened completion and rotation old-cookie 401. This is regression reuse, not a new independent model review.
- Syntax checks passed for server.mjs and public/app.js. Real local runtime Node v26.7.0, built-in SQLite 3.53.4.

## Remaining release gates / limitations

Docker executable is absent on this VM; container image build/runtime, registry availability, Caddy config validation and actual Compose startup are NOT verified. Templates document those exact checks and require image digest pins. Actual final origin/certificate, private ACL reachability, target-host backup/restore and independent source review are also pending. The real HTTPS test proxy verifies the app contract, not Caddy or deployed network policy. No shared Bitwarden login item was created; approved deployment operator must verify existing organization/collection metadata and share/read back the final item without chat disclosure.

Hashes: final source/test/deployment SHA-256 map and canonical manifest digest are in repair-source-hashes.json. Original review artifacts remain unchanged.
