import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  unlinkSync,
} from "node:fs";
import { resolve, join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

process.umask(0o077);
const root = dirname(fileURLToPath(import.meta.url));
const data = resolve(process.env.STUDIO_DATA || join(root, "data"));
mkdirSync(data, { recursive: true, mode: 0o700 });
chmodSync(data, 0o700);
const passwordFile = resolve(
  process.env.STUDIO_PASSWORD_FILE || join(data, "password"),
);
if (process.argv.includes("--init")) {
  if (existsSync(passwordFile)) {
    console.log("Credential file already exists; unchanged.");
    process.exit(0);
  }
  writeFileSync(passwordFile, randomBytes(32).toString("base64url"), {
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    "Private credential file created. Import into your password manager locally. Never paste it into chat.",
  );
  process.exit(0);
}
if (!existsSync(passwordFile))
  throw Error(
    "Missing private password file. Run node server.mjs --init first.",
  );
const password = readFileSync(passwordFile, "utf8").trim();
if (password.length < 20)
  throw Error("Password must be at least 20 characters.");
const salt = randomBytes(32),
  passwordHash = scryptSync(password, salt, 64);
mkdirSync(join(data, "uploads"), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(join(data, "studio.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,event TEXT NOT NULL,record_id TEXT,detail TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);`);
// A private server secret makes the persisted credential fingerprint non-portable.
// Rotate the password file and restart: revoke every old session atomically.
const sessionSecretFile = join(data, "session-secret");
if (!existsSync(sessionSecretFile))
  writeFileSync(sessionSecretFile, randomBytes(32), { mode: 0o600, flag: "wx" });
const credentialFingerprint = scryptSync(password, readFileSync(sessionSecretFile), 64).toString("hex");
db.exec("BEGIN IMMEDIATE");
try {
  const previous = db.prepare("SELECT value FROM meta WHERE key='credential-fingerprint'").get();
  if (previous?.value !== credentialFingerprint) {
    db.exec("DELETE FROM sessions");
    db.prepare("INSERT OR REPLACE INTO meta VALUES('credential-fingerprint',?)").run(credentialFingerprint);
  }
  db.exec("COMMIT");
} catch (e) { db.exec("ROLLBACK"); throw e; }

// Trust one explicitly configured HTTPS origin, never forwarded headers.
const externalOrigin = process.env.STUDIO_EXTERNAL_ORIGIN || "";
let externalURL;
if (externalOrigin) {
  externalURL = new URL(externalOrigin);
  if (externalURL.protocol !== "https:" || externalURL.origin !== externalOrigin ||
      externalURL.username || externalURL.password || externalURL.hostname.includes("*"))
    throw Error("STUDIO_EXTERNAL_ORIGIN must be an exact HTTPS origin without path or credentials.");
}
const secureCookie = externalOrigin ? "; Secure" : "";
const now = () => new Date().toISOString();
const hash = (s) => createHash("sha256").update(s).digest("hex");
const audit = (event, id, detail = "") =>
  db
    .prepare(
      "INSERT INTO audit(event,record_id,detail,created) VALUES(?,?,?,?)",
    )
    .run(event, id, String(detail), now());
function row(r) {
  return r
    ? {
        ...JSON.parse(r.payload),
        id: r.id,
        created: r.created,
        updated: r.updated,
      }
    : null;
}
function get(kind, id) {
  return row(
    db.prepare("SELECT * FROM records WHERE kind=? AND id=?").get(kind, id),
  );
}
function list(kind) {
  return db
    .prepare("SELECT * FROM records WHERE kind=? ORDER BY created DESC,id")
    .all(kind)
    .map(row);
}
function save(kind, id, p, create = false) {
  const time = now();
  if (create)
    db.prepare("INSERT INTO records VALUES(?,?,?,?,?)").run(
      id,
      kind,
      JSON.stringify(p),
      time,
      time,
    );
  else
    db.prepare(
      "UPDATE records SET payload=?,updated=? WHERE id=? AND kind=?",
    ).run(JSON.stringify(p), time, id, kind);
  return get(kind, id);
}
const stages = [
  "brief",
  "script",
  "images",
  "animation",
  "edit",
  "review",
  "publish",
  "results",
];
const fields = {
  characters: ["name", "references", "voice", "rules"],
  projects: [
    "title",
    "character_id",
    "kind",
    "stage",
    "brief",
    "script",
    "images",
    "animation",
    "edit",
    "review",
    "publish",
    "results",
    "website_url",
    "product_notes",
  ],
  actions: [
    "title",
    "project_id",
    "why",
    "instructions",
    "next_step",
    "status",
    "note",
  ],
  services: ["name", "url", "category", "notes", "account_status"],
  jobs: [
    "title",
    "project_id",
    "instructions",
    "next_step",
    "status",
    "output_notes",
  ],
  assets: [
    "name",
    "project_id",
    "character_id",
    "notes",
    "previous_id",
    "version",
    "size",
    "mime",
    "storage",
  ],
};
function fail(status, message) {
  throw Object.assign(Error(message), { status });
}
function validate(kind, input, old = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(400, "Expected an object.");
  for (const k of Object.keys(input))
    if (!fields[kind].includes(k)) fail(400, "Unknown field: " + k);
  const p = { ...old, ...input };
  delete p.id;
  delete p.created;
  delete p.updated;
  for (const [k, v] of Object.entries(p))
    if (typeof v !== "string" || v.length > 20000)
      fail(400, "Fields must be text, at most 20,000 characters.");
  const required =
    kind === "characters" || kind === "services" ? "name" : "title";
  if (kind !== "assets" && !p[required]?.trim())
    fail(400, required + " is required.");
  for (const [key, target] of [
    ["project_id", "projects"],
    ["character_id", "characters"],
  ])
    if (p[key] && !get(target, p[key]))
      fail(400, "Choose an existing " + target.slice(0, -1) + ".");
  if (p.url || p.website_url) {
    const u = p.url || p.website_url;
    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      fail(400, "Use a complete http or https URL.");
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      fail(400, "Only http(s) links without credentials are allowed.");
  }
  if (kind === "projects") {
    p.kind ||= "video";
    p.stage ||= "brief";
    if (
      !["video", "website", "product"].includes(p.kind) ||
      !stages.includes(p.stage)
    )
      fail(400, "Invalid project type or stage.");
  }
  if (kind === "actions") {
    for (const k of ["why", "instructions", "next_step"])
      if (!p[k]?.trim()) fail(400, k + " is required.");
    p.status ||= "pending";
    if (!["pending", "approved", "changes_requested"].includes(p.status))
      fail(400, "Invalid review status.");
    if (input.status && input.status !== old.status)
      fail(400, "Use the decision endpoint to record approval.");
    if (
      old.id &&
      Object.keys(input).some((k) => k !== "status" && input[k] !== old[k])
    )
      p.status = "pending";
  }
  if (kind === "jobs") {
    p.status ||= "awaiting_manual";
    if (!old.id && p.status !== "awaiting_manual")
      fail(400, "New handoffs must start awaiting manual work.");
    if (!["awaiting_manual", "manual_complete", "cancelled"].includes(p.status))
      fail(400, "No executor is connected. Jobs cannot run.");
    if (old.id && ["title", "project_id", "instructions", "next_step"].some(
      (key) => Object.hasOwn(input, key) && (input[key] || "") !== (old[key] || ""),
    )) {
      p.status = "awaiting_manual";
      p.output_notes = "";
    }
    if (p.status === "manual_complete" && !p.output_notes?.trim())
      fail(400, "Record the actual manual result first.");
  }
  if (kind === "services") {
    p.account_status ||= "not_connected";
    if (!["not_connected", "manual_access_reported"].includes(p.account_status))
      fail(400, "Only manual account status is supported.");
  }
  return p;
}
if (!db.prepare("SELECT 1 FROM meta WHERE key=?").get("seed-v1")) {
  for (const service of [
    {
      name: "Higgsfield",
      url: "https://higgsfield.ai/",
      category: "Image and video",
      notes:
        "Domain corroborated in discovery video description. No account or API connected. Paid generation needs separate approval.",
    },
    {
      name: "Agent Zero · 1",
      url: "http://100.108.186.69:50080",
      category: "Manual agent handoff",
      notes:
        "Historical verified link: agent-zero-pilot/REPORT.md. Tailscale required. Not live-health checked by this app; no API connected.",
    },
    {
      name: "Agent Zero · 2",
      url: "http://100.108.186.69:50081",
      category: "Manual agent handoff",
      notes:
        "Historical verified link: agent-zero-pilot/REPORT.md. Tailscale required. Not live-health checked by this app; no API connected.",
    },
  ])
    save(
      "services",
      randomUUID(),
      { ...service, account_status: "not_connected" },
      true,
    );
  db.prepare("INSERT INTO meta VALUES(?,?)").run("seed-v1", now());
}
const attempts = new Map();
const MAX = 15 * 1024 * 1024;
async function body(req) {
  let size = 0,
    chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX)
      fail(413, "Upload is too large. Maximum file size is 10 MiB.");
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    fail(400, "Invalid JSON.");
  }
}
const staticFiles = {
  "/login": ["login.html", "text/html"],
  "/login.js": ["login.js", "text/javascript"],
  "/style.css": ["style.css", "text/css"],
  "/": ["index.html", "text/html"],
  "/app.js": ["app.js", "text/javascript"],
};
const server = http.createServer(async (req, res) => {
  const send = (status, value, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(typeof value === "string" ? value : JSON.stringify(value));
  };
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  try {
    const host = req.headers.host;
    const allowedHost = externalURL?.host || `127.0.0.1:${server.address().port}`;
    if (host !== allowedHost) fail(403, "Untrusted host.");
    const allowedOrigin = externalOrigin || `http://${allowedHost}`;
    if (req.headers.origin && req.headers.origin !== allowedOrigin)
      fail(403, "Cross-origin request denied.");
    const pathname = new URL(req.url, "http://" + host).pathname;
    if (pathname === "/health" && req.method === "GET")
      return send(200, { status: "ok" });
    if (pathname === "/api/login" && req.method === "POST") {
      const key = req.socket.remoteAddress;
      const time = Date.now();
      let a = attempts.get(key);
      if (!a || a.until < time) {
        a = { n: 0, until: time + 60000 };
        attempts.set(key, a);
      }
      if (++a.n > 8) fail(429, "Too many attempts. Try again in one minute.");
      const b = await body(req);
      if (
        typeof b.password !== "string" ||
        b.password.length > 1000 ||
        !timingSafeEqual(scryptSync(b.password, salt, 64), passwordHash)
      )
        fail(401, "Incorrect password.");
      const token = randomBytes(32).toString("base64url"),
        csrf = randomBytes(32).toString("base64url");
      db.prepare("DELETE FROM sessions WHERE expires<?").run(time);
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
        hash(token),
        csrf,
        time + 12 * 3600 * 1000,
      );
      return send(
        200,
        { csrf },
        {
          "set-cookie": `studio_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secureCookie}`,
        },
      );
    }
    const token =
      (req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("studio_session="))
        ?.slice(15) || "";
    const session = db
      .prepare("SELECT * FROM sessions WHERE hash=? AND expires>?")
      .get(hash(token), Date.now());
    const publicStatic = ["/login", "/login.js", "/style.css"].includes(
      pathname,
    );
    if (!session && !publicStatic) {
      if (pathname === "/") return send(303, "", { location: "/login" });
      fail(401, "Sign in to continue.");
    }
    if (req.method === "GET" && staticFiles[pathname]) {
      const [file, mime] = staticFiles[pathname];
      return send(200, readFileSync(join(root, "public", file), "utf8"), {
        "content-type": mime + "; charset=utf-8",
      });
    }
    if (pathname === "/api/session" && req.method === "GET")
      return send(200, { csrf: session.csrf });
    if (
      !["GET", "HEAD"].includes(req.method) &&
      (!session || req.headers["x-csrf-token"] !== session.csrf)
    )
      fail(403, "Session verification failed. Reload and try again.");
    if (pathname === "/api/logout" && req.method === "POST") {
      db.prepare("DELETE FROM sessions WHERE hash=?").run(session.hash);
      return send(
        200,
        { ok: true },
        {
          "set-cookie":
            `studio_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie}`,
        },
      );
    }
    if (pathname === "/api/audit" && req.method === "GET")
      return send(
        200,
        db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 300").all(),
      );
    const match = pathname.match(
      /^\/api\/(characters|projects|actions|services|jobs|assets)(?:\/([a-f0-9-]{36})(?:\/(decision|download))?)?$/,
    );
    if (!match) fail(404, "Not found.");
    const [, kind, id, operation] = match;
    const existing = id ? get(kind, id) : null;
    if (id && !existing) fail(404, "Record not found.");
    if (operation === "download" && kind === "assets" && req.method === "GET") {
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${existing.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
      });
      res.end(readFileSync(join(data, "uploads", existing.storage)));
      return;
    }
    if (
      operation === "decision" &&
      kind === "actions" &&
      req.method === "POST"
    ) {
      const b = await body(req);
      if (
        !["approved", "changes_requested"].includes(b.decision) ||
        typeof b.note !== "string" ||
        !b.note.trim() ||
        b.note.length > 4000
      )
        fail(400, "A decision and review note are required.");
      const { id: _, created, updated, ...p } = existing;
      p.status = b.decision;
      p.note = b.note;
      db.exec("BEGIN");
      try {
        const out = save(kind, id, p);
        audit("decision:" + b.decision, id, b.note);
        db.exec("COMMIT");
        return send(200, out);
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    if (operation) fail(404, "Not found.");
    if (req.method === "GET") return send(200, id ? existing : list(kind));
    if (req.method === "DELETE" && id) {
      const linked = db
        .prepare("SELECT kind,payload FROM records WHERE id<>?")
        .all(id)
        .some((r) => {
          const p = JSON.parse(r.payload);
          return (
            p.character_id === id || p.project_id === id || p.previous_id === id
          );
        });
      if (linked)
        fail(409, "Linked records exist. Remove or unlink them first.");
      db.exec("BEGIN");
      try {
        db.prepare("DELETE FROM records WHERE id=?").run(id);
        audit("delete:" + kind, id, existing.name || existing.title);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      if (kind === "assets")
        unlinkSync(join(data, "uploads", existing.storage));
      return send(200, { ok: true });
    }
    if ((req.method === "POST" && !id) || (req.method === "PATCH" && id)) {
      const b = await body(req);
      let p;
      const recordId = id || randomUUID();
      let stored;
      if (kind === "assets") {
        if (id)
          fail(
            405,
            "Upload a new version instead of modifying asset metadata.",
          );
        const allowed = [
          "name",
          "base64",
          "project_id",
          "character_id",
          "notes",
          "previous_id",
        ];
        if (Object.keys(b).some((k) => !allowed.includes(k)))
          fail(400, "Unknown upload field.");
        if (
          typeof b.name !== "string" ||
          b.name.length > 180 ||
          /[\/\\\x00-\x1f]/.test(b.name) ||
          b.name.includes("..")
        )
          fail(400, "Use a plain filename, without paths.");
        const types = {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
          ".pdf": "application/pdf",
          ".mp4": "video/mp4",
          ".wav": "audio/wav",
          ".mp3": "audio/mpeg",
          ".txt": "text/plain",
        };
        const mime = types[extname(b.name).toLowerCase()];
        if (!mime)
          fail(
            400,
            "Supported files: PNG, JPEG, WebP, PDF, MP4, WAV, MP3 and TXT.",
          );
        if (
          typeof b.base64 !== "string" ||
          !b.base64.length ||
          b.base64.length % 4 !== 0 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64)
        )
          fail(400, "Invalid file encoding.");
        const bytes = Buffer.from(b.base64, "base64");
        if (bytes.length > 10 * 1024 * 1024)
          fail(413, "Maximum file size is 10 MiB.");
        const { base64, ...metadata } = b;
        for (const [key, value] of Object.entries(metadata))
          if (typeof value !== "string" || value.length > 20000)
            fail(
              400,
              "Asset metadata must be text, at most 20,000 characters.",
            );
        for (const k of ["project_id", "character_id"])
          if (
            metadata[k] &&
            !get(k === "project_id" ? "projects" : "characters", metadata[k])
          )
            fail(400, "Invalid asset link.");
        if (
          typeof metadata.notes !== "undefined" &&
          (typeof metadata.notes !== "string" || metadata.notes.length > 20000)
        )
          fail(400, "Invalid notes.");
        let version = 1;
        if (b.previous_id) {
          const prev = get("assets", b.previous_id);
          if (!prev) fail(400, "Previous version not found.");
          if (
            (prev.project_id || "") !== (b.project_id || "") ||
            (prev.character_id || "") !== (b.character_id || "")
          )
            fail(
              400,
              "Versions must retain the same project and character links.",
            );
          if (list("assets").some((x) => x.previous_id === b.previous_id))
            fail(
              409,
              "A newer version already exists. Select the latest version.",
            );
          version = prev.version + 1;
        }
        p = {
          ...metadata,
          version,
          size: bytes.length,
          mime,
          storage: recordId,
        };
        stored = join(data, "uploads", recordId);
        writeFileSync(stored, bytes, { mode: 0o600, flag: "wx" });
      } else p = validate(kind, b, existing || {});
      db.exec("BEGIN");
      try {
        const out = save(kind, recordId, p, !id);
        if (kind === "jobs" && existing && p.status === "awaiting_manual" &&
            ["title", "project_id", "instructions", "next_step"].some(
              (key) => (p[key] || "") !== (existing[key] || "")))
          audit("reopen:jobs", recordId, JSON.stringify(existing));
        audit((id ? "update:" : "create:") + kind, recordId, p.title || p.name);
        db.exec("COMMIT");
        return send(id ? 200 : 201, out);
      } catch (e) {
        db.exec("ROLLBACK");
        if (stored) unlinkSync(stored);
        throw e;
      }
    }
    fail(405, "Method not supported.");
  } catch (e) {
    if (!res.headersSent)
      send(e.status || 500, {
        error: e.status ? e.message : "Internal error. See local server log.",
      });
    else res.end();
    if (!e.status) console.error(e.message);
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 4180), "127.0.0.1", () =>
  console.log(
    `Creator Studio listening at http://127.0.0.1:${server.address().port}`,
  ),
);
process.on("SIGTERM", () =>
  server.close(() => {
    db.close();
    process.exit(0);
  }),
);
