// The edit dialog for tasks, jobs and contacts.

// [field, label, input type]. An array as the type means a <select>.
const FIELDS = {
  tasks: [
    ["title", "Task", "text"],
    ["group", "List", TASK_GROUPS],
    ["line", "Workstream", ["", ...TASK_LINES]],
    ["nextAction", "Next action", "text"],
    ["focus", "This week's focus", "text"],
    ["status", "Status", TASK_STATUSES],
    ["priority", "Priority", PRIORITIES],
    ["week", "Week (Monday)", "date"],
    ["due", "Due date", "date"],
    ["jobIds", "Linked job", "jobpick"],
    ["note", "Notes, blockers, proof of done", "textarea"],
  ],
  jobs: [
    ["title", "Company", "text"],
    ["detail", "Role", "text"],
    ["market", "Region (optional)", "region"],
    ["kind", "Type", JOB_KINDS],
    ["status", "Stage", JOB_STATUSES],
    ["priority", "Priority", PRIORITIES],
    ["comment", "Your questions / notes for research", "textarea"],
    ["url", "Posting URL", "url"],
    ["deadline", "Application deadline", "date"],
    ["deadlineBasis", "Deadline source", DEADLINE_BASES],
    ["due", "Next follow-up (your own date)", "date"],
    ["appliedAt", "Applied on (set automatically)", "date"],
    ["note", "Next steps, why it fits, resume version", "textarea"],
  ],
  contacts: [
    ["title", "Name", "text"],
    ["detail", "Organization / relationship", "text"],
    ["market", "Region (optional)", "region"],
    ["kind", "Type", CONTACT_KINDS],
    ["status", "Status", CONTACT_STATUSES],
    ["due", "Next follow-up", "date"],
    ["note", "Conversation notes / next step", "textarea"],
  ],
};
const WIDE_FIELDS = ["title", "note", "url", "jobIds", "comment"];
const NEW_RECORD_DEFAULTS = {
  tasks: { group: TASK_GROUPS[0], status: TASK_STATUS.TODO },
  jobs: { status: STATUS.EVALUATING, kind: "Full-time", deadlineBasis: "Not checked" },
  contacts: { status: CONTACT_STATUS.TO_CONTACT },
};

// Values already used in the region field, offered as suggestions.
function knownRegions() {
  return [...new Set([...state.jobs, ...state.contacts].map((x) => (x.market || "").trim()).filter(Boolean))].sort();
}

function fieldInput(item, [key, , type]) {
  const value = item[key];
  if (type === "jobpick") return jobPicker(item);
  if (Array.isArray(type)) {
    const options = type.map((v) => `<option value="${esc(v)}" ${value === v ? "selected" : ""}>${esc(v || "—")}</option>`);
    return `<select name="${key}">${options.join("")}</select>`;
  }
  if (type === "textarea") return `<textarea name="${key}">${esc(value)}</textarea>`;
  if (type === "region") {
    const options = knownRegions().map((r) => `<option value="${esc(r)}">`).join("");
    return `<input name="${key}" list="regionList" value="${esc(value)}" placeholder="e.g. US, Remote, EU"><datalist id="regionList">${options}</datalist>`;
  }
  const required = key === "title" ? 'required maxlength="250"' : "";
  return `<input name="${key}" type="${type}" value="${esc(value)}" ${required}>`;
}

function openEditor(kind, id) {
  const item = state[kind].find((x) => x.id === id) || { week, priority: "Medium", ...NEW_RECORD_DEFAULTS[kind] };
  editing = { kind, id };
  $("#editTitle").textContent = id ? "Edit" : { tasks: "New task", jobs: "New job", contacts: "New contact" }[kind];
  $("#archive").hidden = !id;
  $("#archive").textContent = item.archived ? "Restore" : "Archive";
  const links = kind === "tasks" ? taskJobsBlock(item) : kind === "jobs" && id && !isSimple() ? jobTasksBlock(item) : "";
  const scout = kind === "jobs" && item.scout ? `<div class="wide scout-block">${scoutDetail(item)}</div>` : "";
  const fields = FIELDS[kind].map(
    (f) => `<label class="${WIDE_FIELDS.includes(f[0]) ? "wide" : ""}">${f[1]}${fieldInput(item, f)}</label>`,
  );
  $("#fields").innerHTML = (kind === "tasks" ? links + scout : scout + links) + fields.join("");
  $("#editor").showModal();
}

function saveEditor(form) {
  const data = Object.fromEntries(new FormData(form));
  data.title = data.title.trim();
  if (!data.title) return false;
  const list = state[editing.kind];
  const item = list.find((x) => x.id === editing.id);
  if (editing.kind === "jobs") {
    if (item && data.status !== item.status) data.decidedAt = today();
    if (APPLIED_STATUSES.includes(data.status) && !data.appliedAt && !item?.appliedAt) data.appliedAt = today();
  }
  if (item) Object.assign(item, data);
  else list.push({ id: newId(), archived: false, today: false, ...data });
  return true;
}

function toggleArchived() {
  const item = state[editing.kind].find((x) => x.id === editing.id);
  if (item) item.archived = !item.archived;
}

// ---------------------------------------------------------------------------
// Task <-> job links inside the editor
// ---------------------------------------------------------------------------

function taskJobsBlock(t) {
  const { jobs, mode } = linkedJobs(t, state.jobs);
  const how = { manual: "Picked by you", auto: "Matched from the company name in the task title" }[mode];
  const cards = jobs.map(
    (j) => `
      <div class="tj-card">
        ${orgBadge(j)}<strong>${esc(j.title)}</strong><div class="meta">${esc(j.detail || "")}</div>
        <div class="tj-actions">
          ${badge(j.status)}${j.deadline && !APPLIED_STATUSES.includes(j.status) ? deadlineBadge(j) : ""}
          ${externalLink(j.url)}
          <button type="button" class="small" data-edit="jobs:${esc(j.id)}">Open job ›</button>
        </div>
      </div>`,
  );
  const none = mode === "off" ? "This task is set to not link to any job." : "No linked job. Pick one under “Linked job” below.";
  return `
    <div class="wide task-jobs">
      <div class="tj-head"><b>Linked jobs</b>${how && jobs.length ? `<span class="meta">${how}; change it under “Linked job” below</span>` : ""}</div>
      ${cards.join("") || `<div class="meta">${none}</div>`}
    </div>`;
}

function jobTasksBlock(j) {
  const tasks = state.tasks.filter((t) => !t.archived && linkedJobs(t, state.jobs).jobs.some((x) => x.id === j.id));
  if (!tasks.length) return "";
  const rows = tasks.map(
    (t) => `
      <div class="tj-card tj-task">
        <span class="${isDone(t) ? "done" : ""}">${esc(t.title)}</span> ${badge(t.status)}
        <button type="button" class="small" data-edit="tasks:${esc(t.id)}">Open task ›</button>
      </div>`,
  );
  return `<div class="wide task-jobs"><div class="tj-head"><b>Related tasks · ${tasks.length}</b></div>${rows.join("")}</div>`;
}

function jobPicker(item) {
  const current = item.jobIds || "";
  const auto = linkedJobs({ ...item, jobIds: "" }, state.jobs).jobs;
  const autoLabel = auto.length ? "Automatic: " + auto.map((j) => jobShortName(j, auto)).join(", ") : "Automatic (no match yet)";
  const live = state.jobs.filter((j) => !j.archived && !ENDED_STATUSES.includes(j.status));
  const option = (j) =>
    `<option value="${esc(j.id)}" ${current === j.id ? "selected" : ""}>${esc(j.title)} — ${esc(String(j.detail || "").slice(0, 60))} (${esc(j.status)})</option>`;
  const byName = (a, b) => String(a.title).localeCompare(String(b.title));
  const groups = [
    ["★ Starred", live.filter((j) => j.starred)],
    ["In progress", live.filter((j) => !j.starred && ACTIVE_STATUSES.includes(j.status))],
    ["Applied", live.filter((j) => !j.starred && APPLIED_STATUSES.includes(j.status))],
    ["To review", live.filter((j) => !j.starred && j.status === STATUS.TO_REVIEW)],
    ["Later", live.filter((j) => !j.starred && j.status === STATUS.LATER)],
  ];
  // Several IDs can only be set by editing the data directly; keep them selectable.
  const multi = current.includes(",")
    ? `<option value="${esc(current)}" selected>Current: ${esc(current.split(",").map((id) => state.jobs.find((j) => j.id === id)?.title || id).join(", "))}</option>`
    : "";
  return `
    <select name="jobIds">
      <option value="" ${current ? "" : "selected"}>${esc(autoLabel)}</option>
      <option value="none" ${current === "none" ? "selected" : ""}>Don't link a job</option>
      ${multi}
      ${groups
        .filter(([, jobs]) => jobs.length)
        .map(([label, jobs]) => `<optgroup label="${esc(label)}">${jobs.sort(byName).map(option).join("")}</optgroup>`)
        .join("")}
    </select>`;
}
