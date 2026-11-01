# Creator Studio Strix staging — gate not received

No current-app-review GO was delivered to this subagent. No app container was created or started, no production credentials generated, no native installed template/autostart changed, and no endpoint published.

## Verified staging
- Strix root SSH: 100.108.186.69; architecture x86_64.
- Docker backing filesystem: 80 GiB, 50 GiB available at staging; no prune/restart/expansion.
- Built `creator-studio:review-stage`: `sha256:be6cd6131827b2b342e11f29036b2bb7e8eba1c3af4a81ee597a8f06a2ab609e`, linux/amd64, 243151249 bytes.
- Derived build-stage runtime smoke `creator-studio:runtime-verified`: `sha256:ceadce2afff134c8bfe6c74ee676ffba8142cbac31562c20a906acf0b3ecc5f7`; real Node v26.7.0 / SQLite 3.53.4 / x64. No unmanaged docker run.
- Exact source file SHA256s in source-manifest.json. Build context explicitly allowlisted Dockerfile/package/server/public only; no runtime secrets/data.
- Remote staging: `/mnt/fastssd/AppData/creator-studio-stage` (0700). Native XML and dry-run PHP staged there, not installed.
- Native xmlToCommand dry-run verified host network and dockerman managed/WebUI labels; command in native-command.json. No socket/root mount, privilege or published ports; UID1000, readonly root, dropped capabilities, no-new-privileges, resource limits.
- All four source HTTP acceptance/regression tests pass from project directory. Initial invocation from workspace failed because tests resolve server relative to cwd; rerun correctly passed.
- Existing Tailscale Serve HTTPS 8443 proxies localhost:18789. Before/after routes exactly unchanged. Existing hostname is `strix.tail4532cc.ts.net`, listed in CertDomains. Existing HTTPS 8443 passed trusted TLS with HTTP200.
- Proposed origin: `https://strix.tail4532cc.ts.net:9443`. Neither 9443 nor backend4180 had listeners. New port does not collide with existing route. No Funnel configured in Serve snapshot; capability does not mean it is enabled.
- Existing container IDs/start times all exactly unchanged.
- Mac Keychain-backed Bitwarden unlock succeeded. Live Airstream AI org `d43ffb16-4c21-4114-b2b0-b3f201130854`, Helix collection `d33556a6-4f13-43dd-aff8-b3f201130871` verified. Secret values never output. No CreatorStudio item created yet.
- Local source SQLite online backup and isolated restored copy passed integrity_check and identical table counts: records3/audit0/sessions0/meta1. Private copies in scratch, mode0600, parent0700. This is NOT a full appdata/authenticated restore test.

## Architecture
Single native custom Dockerman app with host network; app listens only 127.0.0.1:4180. Existing host Tailscale Serve adds a separate private HTTPS9443 proxy to that loopback address. Preserve Host and Origin; exact external origin makes cookies Secure. No Caddy/shared proxy modification, no Compose, no public exposure. Custom app, not a CA catalog listing. XML Icon remains empty pending an app-owned icon; do not imply catalog provenance.

## Parent execution after explicit reviewed-hash GO
1. Compare source-manifest.json against current review hashes. If changes, rebuild reviewed image before launch. Confirm no other owner deploying Creator Studio.
2. Recheck ports4180/9443, native app absence, free space, existing Serve snapshot. Save current state; preserve all other routes.
3. Inspect source DB metadata by record type before choosing clean init versus migration. Never overwrite existing user work. For migration use online SQLite backup plus consistent uploads/session-secret snapshot, encrypted SSH directly, chmod700 dirs/chmod600 files/chown1000:1000. Source itself stays untouched. Full appdata backup/isolated authenticated restore remains release gate.
4. Generate strong password privately; store mode0600 in `/mnt/fastssd/AppData/creator-studio/secrets/password`, UID1000; data path `/mnt/fastssd/AppData/creator-studio/data` UID1000 mode0700. Never environment-secret. Prefer fresh password so no old preview login reused.
5. Via established Mac Keychain/BW flow, create `CreatorStudio` login with EXACT URI https://strix.tail4532cc.ts.net:9443, password-only app (username optional informational). Set organizationId and collectionIds explicitly at creation; read back exact item and verify URI, shared org/collection and password equality without printing values. No personal-only item. check-vault.py contains verified safe unlock mechanics; adapt creation using base64 JSON and subprocess stdin DEVNULL/timeouts. If vault write blocked, STOP before launching.
6. Install staged XML to `/boot/config/plugins/dockerMan/templates-user/my-creator-studio.xml`. Use native xmlToCommand helper (correct host+none subnet entries required), validate generated command and execute native docker create; start only this app after gate. Add only this name to native autostart and refresh DockerTemplates cache, then read back management labels/mounts/UID/modes/network/listeners.
7. Add ONLY `tailscale serve --bg --https=9443 http://127.0.0.1:4180`. Never reset Serve or use Funnel. Immediately compare existing routes unchanged and new route correct. If incompatible Host handling, disable only9443 and stop only new app; do not weaken strict app checks.
8. Verify real trusted HTTPS on9443, anonymous API401, unknown Host403, foreign/null/wrong-port Origin403, secure cookie flags, login/CSRF/CRUD/upload/manual review/logout, restart persistence, backup+isolated authenticated restore. Verify backend remotely unreachable and listener only loopback. Tailnet grants/access from Brian device and denied nonapproved device still need actual checks; do not assert ACL isolation from Serve alone.
9. Return live URL plus shared vault handle only after these pass. Current proposed URL is NOT live.

## Rollback scope
Disable only Serve9443 (`tailscale serve --https=9443 off` after checking help/current config), stop/remove only new Creator Studio via native manager, remove its autostart entry; retain appdata/backups. Never reset Serve, prune Docker, touch other containers or WD activity.

## Pending canonical note
This plan is also the proposed Obsidian milestone note. Local reference vault was read, not edited; no Mac/iPhone sync claim.
