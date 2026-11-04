# CreatorStudio production — deployed and verified

URL: **https://<tailscale-host>:9443** (private tailnet).

Credential: shared Bitwarden **Airstream AI / Helix → CreatorStudio**, item `70c0aed5-38ac-4f6e-ac6c-b4eb01109e62`. Password-only application; no username required. Exact HTTPS URI saved. Exact item read back and password hash compared privately with the provisioned file. No secret values in this report.

## Installed inventory
- Native custom Docker Manager app `creator-studio`, not a Community Applications listing. Persistent template `/boot/config/plugins/dockerMan/templates-user/my-creator-studio.xml`; native xmlToCommand create, Dockerman labels/cache verified; autostart entry `creator-studio 0`.
- Immutable image pin `sha256:78b91928ce6ffd265698feff7c36196b2053e004a79f4c9e50433f3c90c83b28`. Rebuilt after the reviewed minor desktop-status wording correction. Application/server logic unchanged. Four Node tests and full isolated Chromium desktop/mobile acceptance passed after updating the wording assertion.
- Runtime server/UI hashes match `production-source-manifest.json`; manifest file SHA256 `f04390bf016ce8807a763becf83f0e881dad78c00fe203bda45bffffb03d7ffc`.
- Container `4ae7c800b1b9b153dd195b488063522f83d9df1cc6dbbb5d656591942424f116`; host network, UID/GID1000, readonly root, capabilities dropped, no-new-privileges, resource limits. Custom icon remains empty. Pinned local image has no registry update feed; future upgrades require reviewed rebuild/re-pin through native management.
- Backend binds **127.0.0.1:4180 only**. Tailscale Serve9443 added to existing host service; no Caddy/Compose, Funnel, ACL changes or Docker-daemon restart. Existing HTTPS8443 route unchanged.
- Private fresh appdata `/mnt/fastssd/AppData/creator-studio/data` mode0700 UID1000; password `/mnt/fastssd/AppData/creator-studio/secrets/password` mode0600 UID1000. Fresh SQLite initialized by actual app. No migrated fake/sample business records. Three built-in service links remain explicitly not connected.

## Actual production acceptance
- Trusted-certificate HTTPS login HTTP200, unauthenticated API401. Unknown Host (including spoofed forwarded headers) **403 through actual Tailscale proxy**. Foreign/null/wrong-port/wrong-scheme Origin403. Invalid CSRF403. Authenticated cookie Secure/HttpOnly/SameSite=Strict. Logout revokes API access.
- Real temporary character/project CRUD, action approval, upload and second version/download, manual handoff completion and material-edit reopening all passed. Production restarted only its own new container. Existing session, counts and uploaded bytes persisted. Own temporary records deleted in dependency order; immutable audit deliberately retained with TEST ONLY labels.
- Consistent full cold appdata backup taken while only this app was stopped; isolated local loopback restored process authenticated successfully, matched all collection counts and both upload versions, SQLite integrity_check=ok. Production was never replaced. Private backup/restored fixture at `/home/helix/.hermes-minimal/cache/scratch/studio-production-restore-w84bgk15`; scratch retention is temporary, NOT a durable scheduled backup service.
- Actual deployed browser reached `/login` and correct page title. Browser vault exposed no matching CreatorStudio handle, so **post-deployment authenticated browser interaction is NOT verified**; no credential/session injection bypass was used. Authenticated production HTML/JS and server-side API tested; isolated Chromium full workflow passed on patched source.
- All **19** unrelated container IDs/configs/host configs/mounts/start times/statuses unchanged. All unrelated native templates unchanged; autostart unchanged except appended app. Native cache refreshed and app discovered after restart. Remote connection to backend4180 denied. External runtime source hashes read back.

## Remaining boundaries
- Brian-device/iPhone visual acceptance and actual nonapproved-device tailnet denial not tested; no claim of per-user ACL isolation. Current tailnet policy unchanged. Trusted-host loopback is not isolation from other host-network containers.
- No scheduled/durable backup, backup encryption-at-rest, image registry publication or live upgrade-cycle test. Full restore exercise was isolated on local Node, not a second exposed Unraid app.
- Docker reported kernel lacks swap limit support; memory limit is applied without swap limit. No other resource configuration changed.
- Original Caddy/Compose pack remains unused and unsupported for this deployment; its unknown-Host200 finding was not claimed repaired. Native Tailscale path was independently exercised instead.
- Initial Mac keychain lookup required same-process authorized unlock. Native dry-run staging had created empty directories at appdata/password paths; verified empty, removed only the empty password directory, then provisioned the actual private file. No existing user data overwritten.

Evidence: `production-acceptance.json`, `production-inventory.json`, `production-vault-metadata.json`, `production-native-command.json`, production source manifest and before/after Serve snapshots. Private full pre-change native/container inventory remains `/mnt/fastssd/AppData/creator-studio-stage/production-before` on Strix. Source patches: `public/app.js`, `SPEC.md`, `test/browser_acceptance.py` only (wording and matching assertion); deployment scripts/evidence added under this directory.
