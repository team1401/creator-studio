# Creator Studio, private first slice

A working single-owner production studio with **zero runtime npm dependencies**. Requires Node.js 24+ with `node:sqlite` (verified on Node 26.7.0). Uses SQLite WAL and private files, vanilla JavaScript and native browser forms.

## Run locally

```sh
cd /home/helix/.hermes-minimal/workspace/creator-studio
node server.mjs --init
node server.mjs
```

Open `http://127.0.0.1:4180`. The initializer creates `data/password` with a strong random secret and mode 0600, without printing it. Import/read this file through an approved **local private** password workflow; do not paste the password into chat or commit it. An existing file is left unchanged. Set `STUDIO_PASSWORD_FILE` to an existing private secret file to use a separately provisioned password (minimum 20 characters). Set `STUDIO_DATA` for a different private data directory, `PORT` for a different loopback port.

No credentials are embedded in source or URLs. Runtime data is gitignored. The default data directory contains only seeded service links until Brian creates work. Tests use temporary isolated databases and never seed real character/project records.

## What works

- Characters: create/read/edit/delete, references, voice, rules.
- Video, website and product projects: create/read/edit/delete, optional character, eight pipeline stages, draft content, website link, product notes, manual observed-results notes.
- Needs you: explicit why, instructions, next step, approval/change request with required note and durable audit. Editing decision content reopens it as pending. Approvals are local editorial records, not publication or spending authorization.
- Assets: upload/download/delete, character/project metadata, linked linear versions. Maximum 10 MiB per file; PNG/JPEG/WebP/PDF/MP4/WAV/MP3/TXT only. All files download as attachments, never execute inline. Paths are generated UUIDs; original filenames cannot include paths. Metadata is immutable after upload; upload a new version to revise it.
- Services: CRUD links with provenance notes and manual account state. Seeded only Higgsfield (domain corroborated in source video description) and the two Agent Zero links from the pilot report. All start not connected. These are links, not health checks. No speculative additional provider URLs.
- Handoffs: persistent records beginning `awaiting_manual`. Explicit manual completion requires actual output notes; cancellation supported. Material edits to title, project, instructions or next step reopen awaiting_manual, clear current output evidence, and archive the previous full record in the immutable audit journal. `running` is rejected because no executor exists.
- Audit journal: immutable through API, latest 300 entries in UI. All history remains in SQLite.

## First workflow

Choose first character → create first project → add private reference/draft → add a review action → request changes or record editorial approval. Select website/product as a project type to keep those drafts in the same workspace. Nothing goes live.

## API / future adapter boundary

Authenticated JSON collection endpoints: `/api/characters`, `/api/projects`, `/api/actions`, `/api/services`, `/api/jobs`, `/api/assets`. GET collection/item, POST create, PATCH item, DELETE item. Assets support POST/GET/DELETE, not PATCH. Asset upload JSON includes `name`, `base64`, optional `project_id`, `character_id`, `previous_id`, `notes`. Download: GET `/api/assets/:id/download`.

POST `/api/login` with password sets opaque HttpOnly SameSite=Strict session cookie and returns CSRF token. GET `/api/session` returns the current CSRF token. Send it as `X-CSRF-Token` on authenticated mutations. POST `/api/logout` revokes the session. GET `/api/audit` reads journal. POST `/api/actions/:id/decision` requires `{decision: "approved" | "changes_requested", note: "..."}`.

Job shape: `title`, optional `project_id`, `instructions`, `next_step`, `status`, `output_notes`; returned records also have UUID `id`, `created`, `updated`. Allowed statuses: `awaiting_manual`, `manual_complete`, `cancelled`. A new record must be awaiting_manual. **No worker polls these records, no API key exists, no job is dispatched.** Integration sibling `creator-studio-integration` must propose a separately reviewed authenticated executor contract, not silently treat editorial approval as authority to spend/publish.

## Security and deployment boundary

Server binds **only 127.0.0.1**, with exact Host and Origin checks. Default local HTTP behavior is unchanged. Set `STUDIO_EXTERNAL_ORIGIN` to one exact HTTPS origin for a private loopback reverse proxy; forwarded headers are not trusted. External mode requires Secure cookies and rejects loopback Host requests. See `deploy/README.md` for the gated deployment template. Non-health data and application JS require authentication. Intentional public endpoints: login page, login JS, shared stylesheet, and login API. No CORS. Parameterized SQL, scrypt password comparison, server-side hashed session tokens, 12-hour expiry, CSRF checks, basic login throttling, CSP, no-referrer, nosniff, frame denial. User text uses DOM text nodes, never HTML injection. Linked records block deletion.

This is a local first slice, **not internet-hosting approval**. HTTP session cookie is deliberately not Secure on loopback. Before any remote deployment, review TLS, Secure cookies, proxy/Host/Origin configuration, password provisioning/rotation and session revocation, backups, upload quotas and malware scanning, concurrency and access policy. Sessions persist through a normal restart with the same password and private session-secret file. Rotating the password file and restarting atomically revokes all old sessions; first upgrade to this credential-fingerprint scheme also signs out existing sessions. The file and SQLite database must remain private to the service account. No encryption-at-rest claim. Supported extensions are not proof that an uploaded file is trustworthy; downloads remain untrusted attachments.

No paid generation, purchases, external posting, public routes, storefront deployment or global task-board changes. Do not deploy Strix without the parent's independent native-Unraid review.

## Verification

```sh
node --test test/*.test.mjs
node --check server.mjs
node --check public/app.js
```

Optional browser test needs Python Playwright plus Chromium, **test-only dependencies**, not application dependencies:

```sh
/home/helix/.hermes-minimal/cache/scratch/studio-browser-venv/bin/python test/browser_acceptance.py
```

That temporary venv may expire. Recreate a test venv and install `playwright`, then `python -m playwright install chromium` if needed. Browser test uses real login/forms/uploads on an isolated server and produces screenshots under `verification/`. Its test content is visibly marked TEST ONLY and never enters `data/`.

## Known bounded limitations

No automated generation, asset thumbnails/previews, live service checks, account integrations, metrics ingestion, publishing, storefront, multi-user roles, full text search, pagination beyond latest journal entries, autosave/conflict resolution, backup scheduler or remote deployment. Large production video files exceed the intentionally small first-slice limit. Asset bytes and database writes are not a single crash-atomic unit, so a hard crash can leave an orphan upload; backup/reconciliation remains deployment work. Formal accessibility, Safari/iPhone device testing, and Brian's visual/workflow acceptance are pending. Source work has no parent Git repository, so no commit/diff history was available.
