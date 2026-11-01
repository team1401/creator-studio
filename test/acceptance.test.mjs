import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";

test("private studio real HTTP acceptance and process restart", async () => {
  const dir = mkdtempSync(
    join(process.env.TMPDIR || process.cwd(), "studio-test-"),
  );
  const password = randomBytes(32).toString("hex");
  writeFileSync(join(dir, "password"), password, { mode: 0o600 });
  let child,
    base,
    cookie = "",
    csrf = "";
  async function start() {
    child = spawn(process.execPath, ["server.mjs"], {
      env: { ...process.env, STUDIO_DATA: dir, PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("start timeout " + err)),
        5000,
      );
      child.stdout.on("data", (d) => {
        log += d;
        const m = log.match(/http:\/\/127.0.0.1:\d+/);
        if (m) {
          clearTimeout(timer);
          resolve(m[0]);
        }
      });
      child.on("exit", () => {
        clearTimeout(timer);
        reject(Error("server exited " + err));
      });
    });
  }
  async function stop() {
    const p = once(child, "exit");
    child.kill("SIGTERM");
    await p;
  }
  async function req(path, method = "GET", body, auth = true) {
    const r = await fetch(base + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(auth ? { cookie, "x-csrf-token": csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    let b;
    try {
      b = await r.json();
    } catch {
      b = {};
    }
    return { r, b };
  }
  try {
    await start();
    assert.equal(
      (await req("/api/characters", "GET", undefined, false)).r.status,
      401,
    );
    assert.equal((await req("/", "GET", undefined, false)).r.status, 303);
    assert.equal((await req("/health", "GET", undefined, false)).r.status, 200);
    assert.equal((await req("/app.js", "GET", undefined, false)).r.status, 401);
    assert.equal(
      (await req("/api/login", "POST", { password: "wrong" }, false)).r.status,
      401,
    );
    const cross = await fetch(base + "/api/login", {
      method: "POST",
      headers: {
        origin: "https://untrusted.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ password }),
    });
    assert.equal(cross.status, 403);
    const login = await req("/api/login", "POST", { password }, false);
    assert.equal(login.r.status, 200);
    cookie = login.r.headers.get("set-cookie").split(";")[0];
    csrf = login.b.csrf;
    assert.equal((await req("/api/characters")).b.length, 0);
    const bad = await fetch(base + "/api/characters", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "no csrf" }),
    });
    assert.equal(bad.status, 403);
    const c = await req("/api/characters", "POST", {
      name: "<img src=x onerror=alert(1)>",
      voice: "Warm",
      rules: "No false claims",
      references: "Original reference pack",
    });
    assert.equal(c.r.status, 201);
    const p = await req("/api/projects", "POST", {
      title: "First unpublished reel",
      character_id: c.b.id,
      kind: "video",
      stage: "brief",
      brief: "Test only",
    });
    assert.equal(p.r.status, 201);
    assert.equal(
      (
        await req("/api/projects", "POST", {
          title: "Bad",
          character_id: "missing",
        })
      ).r.status,
      400,
    );
    assert.equal(
      (
        await req("/api/projects/" + p.b.id, "PATCH", {
          stage: "script",
          script: "A real draft",
        })
      ).r.status,
      200,
    );
    const a = await req("/api/assets", "POST", {
      name: "notes.txt",
      base64: Buffer.from("private reference").toString("base64"),
      project_id: p.b.id,
      character_id: c.b.id,
      notes: "source rights pending",
    });
    assert.equal(a.r.status, 201);
    assert.equal(
      (
        await req("/api/assets", "POST", {
          name: "../escape.txt",
          base64: "YQ==",
        })
      ).r.status,
      400,
    );
    assert.equal(
      (
        await req("/api/assets", "POST", {
          name: "script.html",
          base64: "YQ==",
        })
      ).r.status,
      400,
    );
    assert.equal(
      (
        await req("/api/assets", "POST", {
          name: "too-large.txt",
          base64: Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64"),
        })
      ).r.status,
      413,
    );
    assert.equal(
      (
        await req("/api/assets", "POST", {
          name: "notes.txt",
          base64: "YQ==",
          project_id: { bad: true },
        })
      ).r.status,
      400,
    );
    assert.equal(
      (
        await req("/api/services", "POST", {
          name: "Bad link",
          url: "javascript:alert(1)",
        })
      ).r.status,
      400,
    );
    assert.equal(
      (
        await req("/api/services", "POST", {
          name: "Credentials",
          url: "https://user:secret@example.com",
        })
      ).r.status,
      400,
    );
    assert.equal(
      (await req("/api/actions", "POST", { title: "Missing instructions" })).r
        .status,
      400,
    );
    const a2 = await req("/api/assets", "POST", {
      name: "notes-v2.txt",
      base64: "Yg==",
      previous_id: a.b.id,
      project_id: p.b.id,
      character_id: c.b.id,
    });
    assert.equal(a2.b.version, 2);
    assert.equal(
      (await fetch(base + "/api/assets/" + a.b.id + "/download")).status,
      401,
    );
    const download = await fetch(base + "/api/assets/" + a.b.id + "/download", {
      headers: { cookie },
    });
    assert.equal(await download.text(), "private reference");
    assert.match(download.headers.get("content-disposition"), /attachment/);
    const action = await req("/api/actions", "POST", {
      title: "Review reference",
      project_id: p.b.id,
      why: "Continuity",
      instructions: "Compare reference",
      next_step: "Revise script",
    });
    assert.equal(action.r.status, 201);
    assert.equal(
      (
        await req("/api/actions/" + action.b.id + "/decision", "POST", {
          decision: "changes_requested",
          note: "Change tone",
        })
      ).r.status,
      200,
    );
    assert.equal(
      (
        await req("/api/actions/" + action.b.id + "/decision", "POST", {
          decision: "approved",
          note: "Editorial only",
        })
      ).b.status,
      "approved",
    );
    const job = await req("/api/jobs", "POST", {
      title: "Prepare animation handoff",
      project_id: p.b.id,
      instructions: "Manual only",
    });
    assert.equal(job.b.status, "awaiting_manual");
    assert.equal(
      (await req("/api/jobs/" + job.b.id, "PATCH", { status: "running" })).r
        .status,
      400,
    );
    assert.equal(
      (await req("/api/characters/" + c.b.id, "DELETE")).r.status,
      409,
    );
    assert.equal(
      (
        await req("/api/jobs", "POST", {
          title: "Not started",
          status: "manual_complete",
          output_notes: "Claim",
        })
      ).r.status,
      400,
    );
    assert.equal(
      (
        await req("/api/jobs/" + job.b.id, "PATCH", {
          status: "manual_complete",
        })
      ).r.status,
      400,
    );
    assert.equal(
      (
        await req("/api/jobs/" + job.b.id, "PATCH", {
          status: "manual_complete",
          output_notes: "Manually checked draft, no external action",
        })
      ).r.status,
      200,
    );
    const service = await req("/api/services", "POST", {
      name: "Test service",
      url: "https://example.com",
    });
    assert.equal(service.r.status, 201);
    assert.equal(
      (
        await req("/api/services/" + service.b.id, "PATCH", {
          account_status: "manual_access_reported",
        })
      ).r.status,
      200,
    );
    assert.equal(
      (await req("/api/services/" + service.b.id, "DELETE")).r.status,
      200,
    );
    assert.equal(
      (
        await req("/api/characters/" + c.b.id, "PATCH", {
          voice: "Updated voice",
        })
      ).b.voice,
      "Updated voice",
    );
    const audit = await req("/api/audit");
    assert.ok(audit.b.some((x) => x.event === "decision:approved"));
    await stop();
    await start();
    assert.equal(
      (await req("/api/projects/" + p.b.id)).b.script,
      "A real draft",
    );
    assert.equal(
      (await req("/api/actions/" + action.b.id)).b.status,
      "approved",
    );
    assert.equal(
      (await req("/api/characters/" + c.b.id)).b.name,
      "<img src=x onerror=alert(1)>",
    );
    const temp = await req("/api/characters", "POST", { name: "Delete me" });
    assert.equal(
      (await req("/api/characters/" + temp.b.id, "DELETE")).r.status,
      200,
    );
    assert.equal((await req("/api/characters/" + temp.b.id)).r.status, 404);
    assert.equal((await req('/api/actions/' + action.b.id, 'PATCH', {instructions: 'Revised review scope'})).b.status, 'pending');
    assert.equal((await req('/api/assets/' + a.b.id, 'DELETE')).r.status, 409);
    for (const [kind, id] of [['assets', a2.b.id], ['assets', a.b.id], ['actions', action.b.id], ['jobs', job.b.id], ['projects', p.b.id], ['characters', c.b.id]]) {
      assert.equal((await req('/api/' + kind + '/' + id, 'DELETE')).r.status, 200);
      assert.equal((await req('/api/' + kind + '/' + id)).r.status, 404);
    }
    assert.equal((await req('/api/%2e%2e%2fdata%2fpassword')).r.status, 404);
    assert.equal((await req("/api/logout", "POST", {})).r.status, 200);
    assert.equal((await req("/api/characters")).r.status, 401);
  } finally {
    if (child && child.exitCode === null) await stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
