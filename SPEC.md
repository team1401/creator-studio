# First working slice

## Goal and decisions
A private single-owner production notebook with real persisted CRUD and human review. Node 26 is installed; use built-in HTTP, SQLite and crypto, with no runtime npm dependencies. Vanilla HTML/CSS/JS. Loopback only. No network integration executor or outbound API calls.

## Scope
Characters (references, voice, rules); projects (video, website, product; brief through results); actions (why, instructions, next step, approval/change request); private versioned asset uploads; services (link provenance distinct from account connection); queued manual job handoffs; immutable audit journal. Agent Zero adapter is a future boundary at /api/jobs, not an implemented worker. No global task-board reads or writes.

## Non-goals
Paid generation, public publishing, purchases, deploying storefronts, selecting Brian's niche, remote deployment, metrics ingestion, automatic agents, multi-user permissions, public hosting. Approval records are local editorial decisions only, never authority to spend/publish.

## Acceptance and verifier
- Auth denies unauthenticated non-health data and app access; login and static login shell are intentional exceptions. Opaque server-side sessions, scrypt password hash, HttpOnly SameSite cookie, mutation CSRF token, rate-limited login.
- Create/edit/delete characters and projects through real HTTP; invalid relations and traversal rejected. Linked records block destructive deletes.
- Upload supported file with safe private storage and download as attachment; bounded size, metadata and versions, linked character/project. No user-supplied path is used as a storage path.
- Create action with why/instructions/next step; approve/request changes with audit. Buttons never execute external actions.
- Manual jobs start awaiting_manual, never running. Services distinguish historically verified link provenance and unconnected account status.
- Restart server and read same persisted record; fresh workspace has no fictional characters/projects/metrics.
- Browser functional forms and mobile overflow check when browser tooling available; screenshot is evidence of layout, not a full accessibility audit.

## Implementation plan
1. Write real-HTTP Node tests and demonstrate missing implementation failure.
2. Implement scoped SQLite API, auth, upload controls, audit and manual handoff boundary.
3. Implement responsive studio UI with native inline forms and actionable empty states.
4. Run tests, actual process restart, browser flow, static security review; document gaps.

## Verification
`node --test test/*.test.mjs`
`node server.mjs --init` creates private random credential file without printing it.
`node server.mjs` binds only 127.0.0.1:4180.

## Independent-review repairs / private deployment preparation

Choice: material handoff edits reopen awaiting_manual, clear current evidence and archive the previous complete record atomically. No-op edits retain completion. Existing production records are not rewritten speculatively.

Credential generation: persist a private server secret and password-derived fingerprint; first upgrade or password rotation revokes old sessions at restart. Same credentials preserve sessions through normal restart. No credentials/fingerprints are returned by APIs.

Private TLS preparation: optional exact HTTPS external origin, exact Host/Origin checks, no forwarded-header trust, Secure cookies only in external TLS mode. Backend remains 127.0.0.1. Docker/Caddy templates do not authorize remote deployment; final container/network/TLS checks remain parent release gates.

Verifier additions: `node --test test/review-regressions.test.mjs`, browser completion/edit/evidence regression, and `test/independent_review_regression.py` adapted from the original review probe. Test TLS proxy uses an actual generated certificate trusted by the test client. UI reports Argus disconnected, execution disabled, separate API spike evidence and desktop runtime repaired and native input verified; browser takeover not yet verified; automatic dashboard execution disabled; Argus not connected, without live-health claims.

## Review checkpoint
Parent performs independent review and deployment planning. Do not deploy Strix; native Unraid approval/review is separate. Brian reviews visual direction and real workflow before scope expansion.
