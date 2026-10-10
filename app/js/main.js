// App shell: state, saving, the header and filters, event handling, startup.
// Loaded last; the view functions it calls live in js/views/.

const STORAGE_KEY = "job-search-dashboard/state";

// ---------------------------------------------------------------------------
// UI state
// ---------------------------------------------------------------------------

let state = emptyState();
let storageError = "";
let view = "overview";
let week = mondayOf();
let query = "";
let region = "";
let showArchived = false;
let editing = null;
let calMonth = today().slice(0, 7);
let lastPlace = "";
let lastRollWeek = mondayOf();

const VIEW_TITLES = {
  overview: "Move today forward a little.",
  tasks: "Two lists a week, steady progress.",
  jobs: "From discovery to the next conversation.",
  calendar: "See deadlines before they see you.",
  contacts: "Keep every conversation going.",
  review: "See the progress, adjust next week.",
  data: "Your data stays in your hands.",
};

const matchQuery = (x) => matchesQuery(x, searchTerms(query));
// The region dropdown and the search box, applied together.
const inFilter = (x) => (!region || x.market === region) && matchQuery(x);

function newId() {
  return window.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------------------------------------------------------------------------
// Loading and saving
// ---------------------------------------------------------------------------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state = buildDemoState();
      return;
    }
    const parsed = JSON.parse(raw);
    if (!isValidState(parsed)) throw new Error("invalid");
    state = normalizeState(parsed);
  } catch (e) {
    // Never overwrite saved data we could not read: block saving until the
    // user imports a valid backup.
    state = emptyState();
    storageError = "Could not read your saved data, so nothing will be saved over it. Import a valid backup to continue.";
  }
}

function save() {
  if (storageError) {
    $("#saveStatus").textContent = storageError;
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const sync = folder.ready && !state.demo ? " · synced to folder" : folder.handle && !folder.ready ? " · folder needs permission" : "";
    $("#saveStatus").textContent = "Saved " + formatTime(new Date()) + sync;
    folder.scheduleWrite();
    return true;
  } catch (e) {
    $("#saveStatus").textContent = "Saving failed. Export a backup now.";
    return false;
  }
}

function exportBackup() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
  a.download = `job-search-backup-${today()}-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const hasRecords = () => state.tasks.length + state.jobs.length + state.contacts.length > 0;

// Replaces all data, after downloading a backup of the current data.
function replaceState(next, question) {
  const backedUp = hasRecords() && !state.demo;
  if (backedUp) exportBackup();
  if (!confirm(question + (backedUp ? "\n\nA backup of your current data was downloaded first." : ""))) return;
  state = normalizeState(next);
  storageError = "";
  save();
  folder.sync();
  render();
}

// Moves unfinished tasks forward when a new day or week starts.
function rollOverNow() {
  if (storageError) return;
  const thisWeek = mondayOf();
  if (rollOver(state)) {
    if (week < thisWeek && view !== "review") week = thisWeek;
    save();
    render();
  } else if (week < thisWeek && lastRollWeek < thisWeek) {
    week = thisWeek;
    render();
  }
  lastRollWeek = thisWeek;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderStats(weekTasks) {
  const jobs = state.jobs.filter((j) => !j.archived);
  const tiles = [
    [`${weekTasks.filter(isDone).length}/${weekTasks.length}`, "Tasks done this week", "tasks", ""],
    [`${jobs.filter((j) => j.status === STATUS.TO_REVIEW).length} / ${jobs.length}`, "To review / all jobs", "jobs", "inbox"],
    [jobs.filter((j) => APPLIED_STATUSES.includes(j.status)).length, "Applied, incl. interviews", "jobs", "applied"],
    [jobs.filter((j) => j.status === STATUS.INTERVIEWING).length, "Interviewing", "jobs", "applied"],
    [upcomingDeadlines(state).length, "Deadlines in 2 weeks", "calendar", "soon"],
    [dueFollowUps().length, "Follow-ups due", "overview", "follow"],
  ];
  $("#stats").innerHTML = tiles
    .map(
      ([n, label, v, jump]) =>
        `<button type="button" class="stat" data-view="${v}" data-jump="${jump}" title="Show the list"><strong>${n}</strong><span>${label} ›</span></button>`,
    )
    .join("");
}

function renderFilters() {
  const el = $("#filters");
  const regions = knownRegions();
  const key = [view, region, showArchived, week, regions.join(",")].join("|");
  // Re-rendering the search box would steal focus while you type.
  if (["jobs", "contacts"].includes(view) && el.dataset.key === key && $("#search")) {
    $("#clearSearch").hidden = !query;
    return;
  }
  el.dataset.key = key;
  const archivedToggle = `<label><input id="archived" type="checkbox" ${showArchived ? "checked" : ""}> Show archived</label>`;
  if (["overview", "tasks", "review"].includes(view)) {
    el.innerHTML = `
      <label>Week of <input type="date" id="week" value="${week}"></label>
      <span class="meta">Pick today's tasks by dependency, urgency, value and energy; ☆ adds a task to today.</span>
      ${view === "tasks" ? archivedToggle : ""}`;
  } else if (["jobs", "contacts"].includes(view)) {
    const placeholder = view === "jobs" ? "Search companies, roles, locations, notes… (press / to search)" : "Search names, organizations, notes…";
    const regionSelect = regions.length || region
      ? `<select id="region" aria-label="Filter by region">
          <option value="">All regions</option>
          ${[...new Set([...regions, region].filter(Boolean))].map((r) => `<option ${r === region ? "selected" : ""}>${esc(r)}</option>`).join("")}
        </select>`
      : "";
    el.innerHTML = `
      <div class="search-box">
        <span class="search-ico" aria-hidden="true">⌕</span>
        <input id="search" type="search" autocomplete="off" aria-label="Search" placeholder="${placeholder}" value="${esc(query)}">
        <button type="button" class="small" id="clearSearch" ${query ? "" : "hidden"}>Clear</button>
      </div>
      <span id="searchCount" class="meta"></span>
      ${regionSelect}
      ${archivedToggle}`;
  } else {
    el.innerHTML = "";
  }
}

function renderBanner() {
  $("#banner").innerHTML = state.demo
    ? `<p class="notice banner demo"><strong>You are looking at demo data.</strong> Everything here is fictional.
        <button id="clearDemo" class="small primary">Clear demo data and start fresh</button></p>`
    : "";
}

function render() {
  const place = view + "|" + week;
  if (place !== lastPlace) {
    justToggled.clear();
    lastPlace = place;
  }
  $("#date").textContent = formatLongDate(new Date());
  $("#title").textContent = VIEW_TITLES[view];
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $("#add").hidden = ["review", "data", "calendar"].includes(view);
  $("#add").textContent = view === "jobs" ? "+ New job" : view === "contacts" ? "+ New contact" : "+ New task";

  const weekTasks = state.tasks.filter((t) => !!t.archived === (view === "tasks" && showArchived) && taskInWeek(t, week));
  renderBanner();
  renderStats(weekTasks);
  renderFilters();

  const content = $("#content");
  if (view === "overview") content.innerHTML = overviewView(weekTasks);
  if (view === "tasks") content.innerHTML = tasksView(weekTasks);
  if (view === "calendar") content.innerHTML = calendarView();
  if (view === "review") content.innerHTML = reviewView();
  if (view === "data") content.innerHTML = dataView();
  if (view === "jobs" || view === "contacts") {
    const { html, hits } = view === "jobs" ? jobsView() : contactsView();
    content.innerHTML = html;
    $("#searchCount").textContent = query ? `${hits} found` : "";
  }
  if (storageError) $("#saveStatus").textContent = storageError;
}

function scrollToPanel(key) {
  const selectors = {
    star: "#starPanel",
    soon: "#calSoon",
    follow: "#followPanel",
    applied: '[data-stage="applied"]',
    inbox: "#reviewQueue",
  };
  const el = selectors[key] && document.querySelector(selectors[key]);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.remove("flash");
  void el.offsetWidth; // restart the animation
  el.classList.add("flash");
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function showView(name, jump) {
  view = name;
  query = "";
  showArchived = false;
  $("#filters").dataset.key = "";
  if (jump === "applied") stageOpen.applied = true;
  render();
  if (jump) scrollToPanel(jump);
  else window.scrollTo(0, 0);
}

// The one-click decisions on a job in the review queue.
function decide(job, action) {
  const box = document.querySelector(`textarea[data-comment="${CSS.escape(job.id)}"]`);
  if (box) job.comment = box.value.trim();
  if (action === "process") job.status = STATUS.EVALUATING;
  if (action === "apply") job.status = STATUS.PREPARING;
  if (action === "ignore") job.status = STATUS.PASSED;
  if (action === "later") {
    job.status = STATUS.LATER;
    job.priority = "Low";
  }
  job.decidedAt = today();
}

function startTitleEdit(el) {
  const task = state.tasks.find((x) => x.id === el.dataset.title);
  if (!task || el.querySelector("input")) return;
  const input = document.createElement("input");
  input.className = "title-input";
  input.value = task.title;
  input.setAttribute("aria-label", "Rename task");
  el.replaceChildren(input);
  input.focus();
  input.select();
  let finished = false;
  const finish = (keep) => {
    if (finished) return;
    finished = true;
    const value = input.value.trim();
    if (keep && value && value !== task.title) {
      task.title = value;
      save();
    }
    render();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      finish(e.key === "Enter");
    }
  });
  input.addEventListener("blur", () => finish(true));
}

const CLICK_ACTIONS = {
  add: () => openEditor(["jobs", "contacts"].includes(view) ? view : "tasks"),
  close: () => $("#editor").close(),
  export: exportBackup,
  backup: exportBackup,
  import: () => $("#importFile").click(),
  archive: () => {
    toggleArchived();
    save();
    $("#editor").close();
    render();
  },
  saveReview: () => {
    state.reviews[week] = $("#reviewText").value;
    if (save()) $("#reviewSaved").textContent = " Saved.";
  },
  clearSearch: () => {
    query = "";
    render();
    $("#search")?.focus();
  },
  clearDemo: () => replaceState(emptyState(), "Clear the demo data and start with an empty dashboard?"),
  loadDemo: () => replaceState(buildDemoState(), "Replace your data with the demo data?"),
  eraseAll: () => replaceState(emptyState(), "Erase all data in this browser?"),
  fsConnect: () => folder.connect(),
  fsGrant: () => folder.grant(),
  fsBannerGrant: () => folder.grant(),
  fsImport: () => folder.importAll(true),
  fsWrite: () => folder.writeState(true),
};

document.addEventListener("click", (e) => {
  const title = e.target.closest("[data-title]");
  if (title) return startTitleEdit(title);
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.view) return showView(d.view, d.jump);
  if (d.edit) {
    const [kind, id] = d.edit.split(":");
    return openEditor(kind, id);
  }
  if (d.calMonth) {
    calMonth = +d.calMonth === 0 ? today().slice(0, 7) : shiftMonth(calMonth, +d.calMonth);
    return render();
  }
  if (d.star) {
    const job = state.jobs.find((x) => x.id === d.star);
    if (!job) return;
    job.starred = !job.starred;
    job.starredAt = job.starred ? today() : "";
    save();
    return render();
  }
  if (d.pin) {
    const task = state.tasks.find((x) => x.id === d.pin);
    if (!task) return;
    task.today = !task.today;
    task.todayAt = task.today ? today() : "";
    if (!task.today) task.todayFrom = "";
    save();
    return render();
  }
  if (d.act) {
    const job = state.jobs.find((x) => x.id === d.id);
    if (!job) return;
    decide(job, d.act);
    save();
    return render();
  }
  CLICK_ACTIONS[b.id]?.();
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.check) {
    const task = state.tasks.find((x) => x.id === t.dataset.check);
    justToggled.add(task.id);
    task.status = t.checked ? TASK_STATUS.DONE : TASK_STATUS.TODO;
    task.doneAt = t.checked ? today() : "";
    save();
    render();
  }
  if (t.id === "week") {
    week = mondayOf(t.value || today());
    render();
  }
  if (t.id === "region") {
    region = t.value;
    render();
  }
  if (t.id === "archived") {
    showArchived = t.checked;
    render();
  }
});

let commentTimer;
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset?.comment) {
    const job = state.jobs.find((x) => x.id === t.dataset.comment);
    if (!job) return;
    job.comment = t.value;
    t.style.height = "auto";
    t.style.height = t.scrollHeight + "px";
    clearTimeout(commentTimer);
    commentTimer = setTimeout(save, 600);
    return;
  }
  // Wait for input methods (e.g. for Chinese or Japanese) to finish composing.
  if (t.id === "search" && !e.isComposing) {
    query = t.value.trim();
    render();
  }
});

document.addEventListener("compositionend", (e) => {
  if (e.target.id === "search") {
    query = e.target.value.trim();
    render();
  }
});

// Quick-add boxes.
document.addEventListener("submit", (e) => {
  const form = e.target.closest(".quick-add");
  if (!form) return;
  e.preventDefault();
  if (!addQuickTask(form)) return;
  save();
  const key = form.dataset.key;
  render();
  document.querySelector(`.quick-add[data-key="${CSS.escape(key)}"] input`)?.focus();
});

$("#editForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!saveEditor(e.target)) return;
  save();
  $("#editor").close();
  render();
});

$("#importFile").addEventListener("change", async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    const parsed = JSON.parse(await file.text());
    if (!isValidState(parsed)) throw new Error("invalid");
    replaceState(parsed, "Replace the dashboard data with the selected backup?");
  } catch (err) {
    alert("Import failed: that file is not a valid dashboard backup. Nothing was changed.");
  } finally {
    e.target.value = "";
  }
});

// Keyboard shortcuts: "/" focuses search, "n" focuses the first quick-add box,
// Escape clears the search, Enter on a task title renames it.
document.addEventListener("keydown", (e) => {
  const t = e.target;
  const typing = ["input", "textarea", "select"].includes((t.tagName || "").toLowerCase()) || t.isContentEditable;
  if (t.id === "search" && e.key === "Escape" && t.value) {
    e.preventDefault();
    query = "";
    render();
    return;
  }
  if (typing || $("#editor").open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "/" && ["jobs", "contacts"].includes(view)) {
    e.preventDefault();
    $("#search")?.focus();
    $("#search")?.select();
  } else if (e.key === "Enter" && t.matches?.("[data-title]")) {
    e.preventDefault();
    startTitleEdit(t);
  } else if (e.key.toLowerCase() === "n") {
    const input = document.querySelector(".quick-add input");
    if (input) {
      e.preventDefault();
      input.focus();
    }
  }
});

// Remember which stage panels are open.
document.addEventListener(
  "toggle",
  (e) => {
    const stage = e.target?.dataset?.stage;
    if (stage && !query) stageOpen[stage] = e.target.open;
  },
  true,
);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

loadState();
if (!storageError && rollOver(state) && !state.demo) save();
render();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) rollOverNow();
});
setInterval(rollOverNow, 10 * 60 * 1000);
folder.load().then(render);
