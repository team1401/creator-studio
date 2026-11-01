# Private TLS deployment pack — not deployed / approval still required

## Trust boundary

The app always listens on 127.0.0.1, including inside the container. Use **Linux host networking**, not bridge port publishing. The proxy shares host networking and listens only on a selected private Tailscale IPv4 address. There are no Docker published ports. Set Tailscale ACLs/grants to permit only Brian's approved devices/users to that address:443; no public router forwarding, Funnel, public DNS proxy, or wildcard access. Verify these controls on the eventual host before launch. Local host users can reach loopback: it is a trusted-host boundary, not process isolation.

`STUDIO_EXTERNAL_ORIGIN=https://studio.example-private-name` must be the exact final browser origin (optional explicit non-default port, no slash/path). Configure private DNS to the private address. Host and Origin are preserved by the proxy and compared exactly by the app; forwarded headers never authorize requests. Do not strip Origin, rewrite arbitrary Host to the trusted name, or trust X-Forwarded-* to bypass a denial. HTTPS external mode sets HttpOnly, SameSite=Strict, Secure cookies; default loopback HTTP omits Secure intentionally. CSRF tokens are still required.

The Caddy template uses its internal CA. Install only the public CA certificate on approved client trust stores through an authenticated channel. Never share its private CA key. Browser warnings are a failed deployment, not an instruction to click through. A separately approved valid certificate is an alternative; no public certificate/hosting operation is authorized by this pack.

## Build / configuration (operator gate)

Docker is not installed on the development VM, so **image build, Caddy validation and Compose launch remain unverified**. Node 26.7.0 and its actual built-in `node:sqlite` were exercised locally with all tests; the Dockerfile pins the same runtime version. Before deployment, verify image availability/digest, build with `docker build -t creator-studio:reviewed .`, and run `docker run --rm --entrypoint node creator-studio:reviewed -e "const {DatabaseSync}=require('node:sqlite'); const d=new DatabaseSync(':memory:'); console.log(process.version,d.prepare('select sqlite_version() as version').get());"`. Pin the approved Node and Caddy image digests for reproducible deployment after pulling them. The Caddy major tag is a template, not a reproducible release pin.

The build context is allowlisted to package.json, server.mjs, public/ and Dockerfile only. Database, passwords, server secret, tests, screenshots, audit evidence, pending vault notes, certificates and .env files are excluded; the Dockerfile copies only explicit runtime paths. No npm install or native addon is required.

Set non-secret environment references on the approved host:

- `STUDIO_EXTERNAL_ORIGIN`: exact private HTTPS origin
- `STUDIO_PRIVATE_IP`: host's approved Tailscale IPv4
- `STUDIO_DATA_DIR`: absolute persistent private data directory
- `STUDIO_PASSWORD_PATH`: absolute private credential file outside image/context
- `STUDIO_PROXY_DATA`, `STUDIO_PROXY_CONFIG`: absolute private persistent Caddy directories

Match directory/file ownership to the app UID 1000, or explicitly adjust the Compose user to the approved host service UID. Data directory mode 0700, password mode 0600. No Docker socket mount. App root filesystem is read-only and capabilities dropped. Runtime data, uploads and session-secret must persist. Do not accidentally initialize an empty replacement over real data. With authorization, validate `docker compose -f deploy/compose.yaml config --quiet`, validate the Caddy configuration using its image, then start. Do not run these launch steps on Strix until parent review and explicit dispatch.

## Credentials / shared handoff

Initialize an empty credential file with `node server.mjs --init` in the intended private data location, or provision through the approved secret workflow. Never print it, put it in Compose YAML, commit it, or paste it into chat. Save the app login URL and password to Bitwarden **Airstream AI** organization, **Helix** collection, after verifying current organization/collection metadata. Read back the exact saved item and verify organizationId and collectionIds; a personal-only item is not a shared handoff. This pack does not claim a new vault item was created.

Rotation: stop only this app, replace its private password file with a strong new vault-generated value, preserve ownership/mode, recreate/restart this app (a bind-mounted file replaced by rename requires container recreation), and verify an old cookie gets 401 and a fresh login succeeds. The private session-secret plus password-derived fingerprint automatically invalidates all sessions on changed credentials; same credentials/secret preserve normal-restart sessions. First upgrade revokes legacy sessions once. Password changes are read at startup, not hot-reloaded. Never log cookies or CSRF values.

## Consistent backup / restore

Stop only Creator Studio for a consistent backup; leave unrelated services alone. Copy the entire private data directory, including studio.sqlite, any WAL/SHM files, uploads and session-secret, plus the separately stored password and deployment configuration into an encrypted, access-restricted backup. Back up the private Caddy state separately (contains CA private key). Do not copy only the SQLite main file while it is live. Restart the app and confirm authenticated reads after backup. Retain a pre-upgrade backup; never overwrite it in place.

Restore into a new isolated private directory, with the same ownership/modes. Start an isolated loopback process on a different port; verify SQLite integrity, record and asset counts, actual download bytes, and login before switching mounts. Rotate credentials after a disaster/security restore to revoke restored cookies. Backup/restore drill on the target host remains a release gate, not a completed claim.

## Acceptance before private release

1. Independent source review of final hashes; build/runtime smoke checks above.
2. Final HTTPS origin has a trusted certificate; actual browser login, authenticated CRUD/upload/manual review and logout succeed.
3. Unknown Host and foreign/null/wrong-scheme/wrong-port Origin return 403; anonymous API returns 401. Secure/HttpOnly/SameSite cookie and CSRF denial confirmed.
4. Normal restart retains intended sessions/data; rotated credential restart denies old cookie and accepts new login.
5. Non-approved remote device cannot reach private endpoint; no remote client can reach backend 4180; inspect host listeners and ACLs.
6. Run backup/restore drill. Record deployment origin, image digests and verification timestamp without secrets.

Local automated evidence: `node --test test/*.test.mjs` includes a real HTTPS reverse proxy with a generated trusted test certificate and exact configured-origin success, denied cases and Secure cookie checks. This validates app/proxy contract, **not the undeployed Caddy/Compose instance or final network ACLs**. Chromium acceptance covers manual completion reopening, evidence clearing, explicit disconnected statuses and mobile layout. Desktop repair remains a separate report; Argus and automatic dashboard execution are not connected.
