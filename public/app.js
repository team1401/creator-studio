const $ = (s) => document.querySelector(s);
const state = {};
let csrf = "";
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
const labels = {
  studio: "Studio overview",
  characters: "Characters",
  projects: "Production",
  actions: "Needs you",
  assets: "Asset library",
  jobs: "Agent handoffs",
  services: "Services & tools",
  audit: "Activity journal",
};
const singular = {
  characters: "character",
  projects: "project",
  actions: "action",
  assets: "asset",
  jobs: "handoff",
  services: "service",
};
const descriptions = {
  characters: "The reference, voice and boundaries behind every piece.",
  projects:
    "Video, website and product work, from the first brief to observed results.",
  actions: "Decisions that need your judgment, with a reason and a next step.",
  assets: "Private originals and revisions, linked to the work they belong to.",
  jobs: "Prepare the next task. An agent is not connected to this studio yet.",
  services: "Useful destinations, without pretending an account is connected.",
  audit: "A local record of changes and editorial decisions.",
};
const definitions = {
  characters: [
    ["name", "Character name", "text", true],
    [
      "references",
      "Project references / appearance / source links",
      "textarea",
    ],
    ["voice", "Voice and personality", "textarea"],
    ["rules", "Rules, disclosure and boundaries", "textarea"],
  ],
  projects: [
    ["title", "Project title", "text", true],
    ["kind", "Project type", ["video", "website", "product"]],
    ["character_id", "Character", "characters"],
    ["stage", "Current stage", stages],
    ["brief", "Brief: audience, format, goal", "textarea"],
    ["script", "Script / page copy", "textarea"],
    ["images", "Image plan and references", "textarea"],
    ["animation", "Animation instructions", "textarea"],
    ["edit", "Edit notes", "textarea"],
    ["review", "Review checklist / rights / disclosure", "textarea"],
    ["publish", "Publishing plan (manual only)", "textarea"],
    ["results", "Observed results and evidence (manual entry)", "textarea"],
    ["website_url", "Website URL, if one exists", "url"],
    ["product_notes", "Offer / product notes", "textarea"],
  ],
  actions: [
    ["title", "Decision title", "text", true],
    ["project_id", "Project", "projects"],
    ["why", "Why you are needed", "textarea", true],
    ["instructions", "What to do, step by step", "textarea", true],
    ["next_step", "What happens next", "textarea", true],
  ],
  services: [
    ["name", "Service name", "text", true],
    ["url", "Website / tool URL", "url", true],
    ["category", "Used for", "text"],
    [
      "account_status",
      "Account status",
      ["not_connected", "manual_access_reported"],
    ],
    ["notes", "Provenance and instructions", "textarea"],
  ],
  jobs: [
    ["title", "Handoff title", "text", true],
    ["project_id", "Project", "projects"],
    ["instructions", "Bounded task and constraints", "textarea", true],
    ["next_step", "Manual handoff instructions", "textarea"],
    [
      "status",
      "Local job status",
      ["awaiting_manual", "manual_complete", "cancelled"],
    ],
    ["output_notes", "Actual manual result / evidence", "textarea"],
  ],
  assets: [
    ["name", "Filename", "text", true],
    ["file", "File, maximum 10 MiB", "file", true],
    ["project_id", "Project", "projects"],
    ["character_id", "Character", "characters"],
    ["previous_id", "Previous version (optional)", "assets"],
    ["notes", "Source, rights and other metadata", "textarea"],
  ],
};
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") n.className = v;
    else n.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child != null)
      n.append(
        typeof child === "string" ? document.createTextNode(child) : child,
      );
  }
  return n;
}
const pretty = (s) =>
  String(s || "")
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
const button = (text, fn, cls = "") =>
  el("button", { type: "button", class: cls, onClick: fn }, text);
const link = (text, href, cls = "") => el("a", { href, class: cls }, text);
function notice(text, error = false) {
  $("#notice").textContent = text;
  $("#notice").classList.toggle("error", error);
}
async function api(path, method = "GET", body) {
  const r = await fetch("/api/" + path, {
    method,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401) {
    location.href = "/login";
    throw Error("Session expired.");
  }
  const b = await r.json();
  if (!r.ok) throw Error(b.error || "Request failed.");
  return b;
}
async function refresh() {
  await Promise.all(
    Object.keys(definitions).map(async (k) => (state[k] = await api(k))),
  );
  state.audit = await api("audit");
  $("#pending-count").textContent =
    state.actions.filter(
      (x) => x.status === "pending" || x.status === "changes_requested",
    ).length || "";
}
function section() {
  return labels[location.hash.slice(1)] ? location.hash.slice(1) : "studio";
}
function nameOf(kind, id) {
  return (
    state[kind]?.find((x) => x.id === id)?.name ||
    state[kind]?.find((x) => x.id === id)?.title ||
    "Unlinked"
  );
}
function heading(title, description, action) {
  return el(
    "div",
    { class: "page-head" },
    el(
      "div",
      {},
      el("p", { class: "eyebrow" }, "THE WORKSPACE"),
      el("h1", {}, title),
      el("p", { class: "muted" }, description),
    ),
    action,
  );
}
function route() {
  const kind = section();
  $("#breadcrumb").textContent = labels[kind].toUpperCase();
  document.querySelectorAll("nav a").forEach((a) => {
    if (a.hash === "#" + kind) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const view = $("#view");
  view.replaceChildren();
  if (["studio", "services", "jobs"].includes(kind)) view.append(
    el("section", { class: "record", "aria-label": "Integration capabilities" },
      el("h2", {}, "Integration capabilities"),
      el("p", {}, "Automatic execution: disabled. No dashboard executor is connected."),
      el("p", {}, "Argus: not connected."),
      el("p", {}, "Agent Zero API: send/poll tested in a separate integration spike (reported evidence), not connected to this dashboard. Not a live health check."),
      el("p", {}, "Desktop runtime repaired and native input verified; browser takeover not yet verified; automatic dashboard execution disabled; Argus not connected. Separate repair evidence, not a live health check."),
    ),
  );
  if (kind === "studio") return overview(view);
  view.append(
    heading(
      labels[kind],
      descriptions[kind],
      definitions[kind]
        ? button(
            "+ " +
              (kind === "assets" ? "Upload asset" : "New " + singular[kind]),
            () => editor(kind),
          )
        : null,
    ),
    el("div", { id: "editor-slot" }),
  );
  if (kind === "audit") {
    if (!state.audit.length)
      view.append(
        empty(
          "The journal starts with your first decision.",
          "Create a character or project and the change will appear here.",
        ),
      );
    for (const a of state.audit)
      view.append(
        el(
          "article",
          { class: "record" },
          el(
            "p",
            { class: "record-meta" },
            new Date(a.created).toLocaleString(),
          ),
          el("h3", {}, pretty(a.event.replace(":", " · "))),
          el("p", {}, a.detail),
        ),
      );
    return;
  }
  if (!state[kind].length)
    view.append(
      empty(
        "Your first " + singular[kind] + " starts here.",
        emptyText(kind),
        button(
          kind === "assets" ? "Upload an asset" : "Create " + singular[kind],
          () => editor(kind),
        ),
      ),
    );
  for (const item of state[kind]) view.append(record(kind, item));
}
function empty(title, text, action) {
  return el(
    "section",
    { class: "empty" },
    el("h2", {}, title),
    el("p", {}, text),
    action,
  );
}
function emptyText(kind) {
  return {
    characters:
      "Choose the character you want to build. Add references, a voice and rules before producing content.",
    projects:
      "Give one piece of work a clear brief. Start with an unpublished video, website or product.",
    actions:
      "Add a decision when a draft needs human judgment. Include why, exact instructions and what happens next.",
    assets:
      "Upload a reference, draft or finished file. Keep the original private and add revisions as new versions.",
    jobs: "Write a bounded handoff for manual use in Agent Zero. This does not send or run a task.",
    services:
      "Add a trusted website or tool. Record where the link came from and whether you have checked your account.",
  }[kind];
}
function overview(view) {
  view.append(
    heading(
      "Make room for the next good idea.",
      "Your work, its next step, and the decisions only you can make.",
    ),
  );
  const pending = state.actions.filter((x) => x.status !== "approved");
  if (!state.characters.length)
    view.append(
      el(
        "section",
        { class: "welcome" },
        el("p", { class: "eyebrow" }, "START WITH ONE CHARACTER"),
        el("h2", {}, "Who are we creating with?"),
        el(
          "p",
          {},
          "Choose your first character. Define their reference, voice and boundaries. There is no preset niche and nothing is published.",
        ),
        button("Choose your first character", () => openEditor("characters")),
      ),
    );
  else if (!state.projects.length)
    view.append(
      el(
        "section",
        { class: "welcome" },
        el("p", { class: "eyebrow" }, "ONE CLEAR BRIEF"),
        el("h2", {}, "Give your character a first project."),
        el(
          "p",
          {},
          "Plan an unpublished video, website or product. Keep the work small enough to review well.",
        ),
        button("Create your first project", () => openEditor("projects")),
      ),
    );
  else
    view.append(
      el(
        "section",
        { class: "welcome" },
        el("p", { class: "eyebrow" }, "WHAT NEXT"),
        el(
          "h2",
          {},
          pending.length ? pending[0].title : "Move one draft forward.",
        ),
        el(
          "p",
          {},
          pending.length
            ? pending[0].next_step
            : "Open a project, add the next draft or reference, then create a review action when you need a decision.",
        ),
        link(
          pending.length ? "Review what needs you" : "Open production",
          pending.length ? "#actions" : "#projects",
          "button",
        ),
      ),
    );
  const left = el(
    "section",
    {},
    el(
      "div",
      { class: "section-title" },
      el("h2", {}, "On the workbench"),
      link("All production", "#projects"),
    ),
  );
  if (!state.projects.length)
    left.append(
      empty(
        "No drafts yet.",
        "Your first brief will live here. No examples are mixed into your real work.",
      ),
    );
  else
    state.projects
      .slice(0, 4)
      .forEach((p) => left.append(record("projects", p, true)));
  const right = el(
    "section",
    {},
    el(
      "div",
      { class: "section-title" },
      el("h2", {}, "A deliberate workflow"),
    ),
  );
  [
    [
      "01",
      "Define the character",
      "Reference, voice, disclosure and boundaries.",
      "#characters",
    ],
    [
      "02",
      "Make an unpublished draft",
      "Brief, script, images, animation and edit.",
      "#projects",
    ],
    [
      "03",
      "Review, then decide",
      "Human approval stays separate from publishing.",
      "#actions",
    ],
  ].forEach(([n, t, d, url]) =>
    right.append(
      el(
        "div",
        { class: "step" },
        el("span", { class: "step-num" }, n),
        el(
          "div",
          {},
          el("h3", {}, t),
          el("p", { class: "muted" }, d),
          link("Open " + t.toLowerCase(), url),
        ),
      ),
    ),
  );
  view.append(el("div", { class: "split" }, left, right));
  view.append(
    el(
      "div",
      { class: "section-title" },
      el("h2", {}, "Agent boundary"),
      link("Prepare a handoff", "#jobs"),
    ),
    el(
      "p",
      { class: "muted" },
      "No agent is running from this app. Handoffs are persistent manual instructions. Generation, publishing, purchases and storefront deployments require separate approval.",
    ),
  );
}
function record(kind, item, compact = false) {
  const card = el("article", { class: "record" });
  const status =
    item.stage ||
    item.status ||
    item.account_status ||
    (kind === "assets" ? "Version " + item.version : "Reference profile");
  card.append(
    el(
      "div",
      { class: "record-head" },
      el(
        "div",
        {},
        el("h2", { class: "record-title" }, item.title || item.name),
        el(
          "span",
          { class: "record-meta" },
          item.project_id
            ? nameOf("projects", item.project_id)
            : item.character_id
              ? nameOf("characters", item.character_id)
              : kind === "projects"
                ? pretty(item.kind)
                : "Saved " + new Date(item.updated).toLocaleDateString(),
        ),
      ),
      el("span", { class: "badge" }, pretty(status)),
    ),
  );
  if (kind === "projects")
    card.append(
      el(
        "div",
        { class: "pipeline", "aria-label": "Production stages" },
        stages.map((s) =>
          el("span", { class: s === item.stage ? "current" : "" }, pretty(s)),
        ),
      ),
      el(
        "p",
        { class: "muted" },
        item.brief || "Add a brief to make the next step clear.",
      ),
    );
  if (kind === "characters")
    card.append(
      el(
        "p",
        { class: "muted" },
        item.voice || "Add a voice and personality to guide the work.",
      ),
    );
  if (kind === "services") {
    card.append(
      el(
        "p",
        { class: "muted" },
        item.notes || "User-entered link. Not independently verified.",
      ),
      el(
        "p",
        { class: "record-meta" },
        "Connection: not integrated. Account status is a manual report, not a live check.",
      ),
    );
    if (item.url)
      card.append(
        el(
          "a",
          { href: item.url, target: "_blank", rel: "noopener noreferrer" },
          "Open " + item.name + " ↗",
        ),
      );
  }
  if (kind === "jobs")
    card.append(
      el("p", {}, item.instructions || "Add the bounded task instructions."),
      el(
        "p",
        { class: "muted" },
        "Local record only. No agent execution or external request.",
      ),
      el(
        "p",
        {},
        item.output_notes ||
          item.next_step ||
          "Next: open Agent Zero from Services, review the task, and hand it over manually.",
      ),
    );
  if (kind === "assets")
    card.append(
      el(
        "p",
        { class: "muted" },
        `${(item.size / 1024).toFixed(1)} KiB · ${item.mime} · Private download`,
      ),
      el(
        "p",
        {},
        item.notes ||
          "Add source and rights notes when uploading a new version.",
      ),
    );
  if (kind === "actions") {
    const dl = el("dl", { class: "detail" });
    for (const [key, label] of [
      ["why", "Why you"],
      ["instructions", "What to do"],
      ["next_step", "Then what"],
    ])
      dl.append(el("dt", {}, label), el("dd", {}, item[key]));
    card.append(dl);
    if (item.note)
      card.append(el("p", { class: "muted" }, "Last review: " + item.note));
    const f = el("form", { class: "review-form" });
    const input = el("textarea", {
      name: "note",
      id: "review-" + item.id,
      required: "",
      placeholder: "Record your reasoning or requested changes",
      maxlength: "4000",
    });
    f.append(
      el("label", { for: "review-" + item.id }, "Review note"),
      input,
      el(
        "div",
        { class: "record-actions" },
        el(
          "button",
          { type: "submit", value: "approved", name: "decision" },
          "Approve locally",
        ),
        el(
          "button",
          {
            type: "submit",
            value: "changes_requested",
            name: "decision",
            class: "secondary",
          },
          "Request changes",
        ),
      ),
      el(
        "p",
        { class: "hint" },
        "Editorial decision only. Nothing is generated, purchased or published.",
      ),
    );
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submit = e.submitter;
      submit.disabled = true;
      try {
        await api("actions/" + item.id + "/decision", "POST", {
          decision: submit.value,
          note: input.value,
        });
        await refresh();
        route();
        notice("Review recorded in the activity journal.");
      } catch (e) {
        notice(e.message, true);
      } finally {
        submit.disabled = false;
      }
    });
    card.append(f);
  }
  if (!compact && ["characters", "projects"].includes(kind)) {
    const details = el("details", {}, el("summary", {}, "View saved details"));
    const dl = el("dl", { class: "detail" });
    for (const [key, label] of definitions[kind])
      if (
        item[key] &&
        !["title", "name", "stage", "kind", "character_id"].includes(key)
      )
        dl.append(el("dt", {}, label), el("dd", {}, item[key]));
    details.append(dl);
    card.append(details);
  }
  const actions = el("div", { class: "record-actions" });
  if (kind === "assets")
    actions.append(
      link("Download", `/api/assets/${item.id}/download`, "button secondary"),
      button(
        "Upload next version",
        () =>
          editor("assets", {
            previous_id: item.id,
            project_id: item.project_id || "",
            character_id: item.character_id || "",
          }),
        "secondary",
      ),
    );
  else
    actions.append(
      button(
        compact ? "Open project" : "Edit",
        () => (compact ? openEditor(kind, item) : editor(kind, item)),
        "secondary",
      ),
    );
  if (kind === "projects" && !compact)
    actions.append(
      button(
        "Add review action",
        () => openEditor("actions", { project_id: item.id }),
        "secondary",
      ),
      button(
        "Prepare handoff",
        () => openEditor("jobs", { project_id: item.id }),
        "secondary",
      ),
    );
  if (!compact)
    actions.append(
      button("Delete", () => confirmDelete(kind, item, actions), "danger"),
    );
  card.append(actions);
  return card;
}
function confirmDelete(kind, item, container) {
  container.replaceChildren(
    el(
      "span",
      { class: "hint" },
      "Delete this " +
        singular[kind] +
        " permanently? Linked records must be removed first.",
    ),
    button(
      "Confirm delete",
      async () => {
        try {
          await api(kind + "/" + item.id, "DELETE");
          await refresh();
          route();
          notice("Deleted. The audit entry is retained.");
        } catch (e) {
          notice(e.message, true);
        }
      },
      "danger",
    ),
    button("Keep it", () => route(), "secondary"),
  );
}
function openEditor(kind, item = {}) {
  history.replaceState(null, "", "#" + kind);
  route();
  editor(kind, item);
}
function editor(kind, item = {}) {
  const slot = $("#editor-slot");
  if (!slot) {
    location.hash = kind;
    route();
    return editor(kind, item);
  }
  const form = el("form", { class: "editor" });
  form.append(el("h2", {}, (item.id ? "Edit " : "New ") + singular[kind]));
  const grid = el("div", { class: "form-grid" });
  for (const [key, label, type, required] of definitions[kind]) {
    let input;
    const id = "field-" + key;
    if (
      Array.isArray(type) ||
      ["characters", "projects", "assets"].includes(type)
    ) {
      input = el("select", { id, name: key });
      if (Array.isArray(type))
        type.forEach((v) =>
          input.append(el("option", { value: v }, pretty(v))),
        );
      else {
        input.append(el("option", { value: "" }, "Not linked"));
        state[type].forEach((v) =>
          input.append(
            el(
              "option",
              { value: v.id },
              (v.name || v.title) +
                (type === "assets" ? " · v" + v.version : ""),
            ),
          ),
        );
      }
    } else if (type === "textarea")
      input = el("textarea", { id, name: key, maxlength: "20000" });
    else
      input = el("input", {
        id,
        name: key,
        type,
        maxlength: "20000",
        ...(type === "file"
          ? { accept: ".png,.jpg,.jpeg,.webp,.pdf,.mp4,.wav,.mp3,.txt" }
          : {}),
      });
    if (required) input.required = true;
    if (type !== "file" && item[key] != null) input.value = item[key];
    grid.append(
      el(
        "div",
        { class: "field" + (type === "textarea" ? " wide" : "") },
        el("label", { for: id }, label + (required ? " *" : "")),
        input,
      ),
    );
  }
  form.append(grid);
  if (kind === "assets")
    form.elements.file.addEventListener("change", () => {
      if (form.elements.file.files[0])
        form.elements.name.value = form.elements.file.files[0].name;
    });
  const save = el(
    "button",
    { type: "submit" },
    kind === "assets" ? "Upload privately" : "Save " + singular[kind],
  );
  form.append(
    el(
      "div",
      { class: "form-actions" },
      save,
      button("Cancel", () => slot.replaceChildren(), "secondary"),
    ),
    el(
      "p",
      { class: "hint" },
      "Stored only in this studio. Required fields are marked *.",
    ),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    save.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      if (kind === "assets") {
        const file = form.elements.file.files[0];
        if (!file || file.size > 10 * 1024 * 1024)
          throw Error("Choose a file no larger than 10 MiB.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        data.base64 = btoa(binary);
        delete data.file;
      }
      await api(
        kind + (item.id ? "/" + item.id : ""),
        item.id ? "PATCH" : "POST",
        data,
      );
      await refresh();
      route();
      notice("Saved to your private studio.");
    } catch (e) {
      notice(e.message, true);
      $("#notice").scrollIntoView({ block: "nearest" });
    } finally {
      save.disabled = false;
    }
  });
  slot.replaceChildren(form);
  form.scrollIntoView({ block: "start" });
  form.querySelector("input,textarea,select")?.focus();
}
document.querySelectorAll("#logout, #logout-mobile").forEach((button) =>
  button.addEventListener("click", async () => {
    try {
      await api("logout", "POST", {});
      location.href = "/login";
    } catch (e) {
      notice(e.message, true);
    }
  }),
);
window.addEventListener("hashchange", () => {
  route();
});
(async () => {
  try {
    csrf = (await api("session")).csrf;
    await refresh();
    route();
  } catch (e) {
    notice(e.message, true);
  }
})();
