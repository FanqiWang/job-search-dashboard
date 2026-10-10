// Tasks: the rows and quick-add boxes used by the overview and the weekly lists.

// Tasks ticked off during this view stay where they are until you navigate
// away, so a list does not jump around under your cursor.
const justToggled = new Set();
const settled = (t) => isDone(t) && !justToggled.has(t.id);
const undoneFirst = (tasks) => [...tasks.filter((t) => !settled(t)), ...tasks.filter(settled)];
const doneToday = (t) => isDone(t) && t.doneAt === today();

function rollBadges(t) {
  const rolled = Array.isArray(t.rolledWeeks) ? t.rolledWeeks : [];
  let html = "";
  if (rolled.includes(week) && t.week !== week) {
    html += `<span class="roll-badge">↪ Unfinished, moved to the week of ${esc(shortDate(t.week))}</span>`;
  } else if (rolled.length && !isDone(t)) {
    const times = rolled.length > 1 ? ` · ${rolled.length} times` : "";
    html += `<span class="roll-badge">↪ Carried over from the week of ${esc(shortDate(rolled[0]))}${times}</span>`;
  }
  if (t.today && t.todayFrom && !isDone(t)) {
    html += `<span class="roll-badge day">↻ On today's list since ${esc(shortDate(t.todayFrom))}</span>`;
  }
  return html;
}

function taskJobChips(t) {
  const { jobs } = linkedJobs(t, state.jobs);
  if (!jobs.length) return "";
  const chips = jobs.map(
    (j) => `<button type="button" class="job-chip" data-edit="jobs:${esc(j.id)}"
      title="${esc(j.title + " — " + (j.detail || "") + " (open job)")}">↗ ${esc(jobShortName(j, jobs))} <span>${esc(j.status)}</span></button>`,
  );
  return `<div class="job-chips">${chips.join("")}</div>`;
}

function taskRow(t) {
  const done = isDone(t);
  return `
    <div class="row task-row ${done ? "is-done" : ""}">
      <input type="checkbox" aria-label="Mark “${esc(t.title)}” as done" data-check="${esc(t.id)}" ${done ? "checked" : ""}>
      <div class="grow">
        <div class="task-title ${done ? "done" : ""}" data-title="${esc(t.id)}" tabindex="0" title="Click to rename">${esc(t.title)}</div>
        <div class="meta">
          ${badge(t.status)}${priorityBadge(t.priority)}${dueBadge(t.due)}
          ${t.line ? badge(t.line) : ""}${t.focus ? badge(t.focus) : ""}
          ${rollBadges(t)}${taskJobChips(t)}
          ${t.nextAction ? `<div class="note">Next: ${esc(t.nextAction)}</div>` : ""}
          ${t.note ? `<div class="note">${esc(t.note)}</div>` : ""}
        </div>
      </div>
      <button class="small" data-pin="${esc(t.id)}" aria-label="${t.today ? "Remove from" : "Add to"} today" title="${t.today ? "Remove from" : "Add to"} today">${t.today ? "★" : "☆"}</button>
      <button class="small" data-edit="tasks:${esc(t.id)}">Details</button>
    </div>`;
}

// An inline "type and press Enter" box. A trailing "!" makes the task high priority.
function quickAdd(key, { group = TASK_GROUPS[0], line = "", today: forToday = false } = {}) {
  return `
    <form class="quick-add" data-key="${esc(key)}" data-group="${esc(group)}" data-line="${esc(line)}" data-today="${forToday ? "1" : ""}">
      <input name="q" autocomplete="off" aria-label="Add a task" placeholder="+ Add a task and press Enter (end with ! for high priority)">
    </form>`;
}

function addQuickTask(form) {
  let title = form.q.value.trim();
  let priority = "Medium";
  if (/!$/.test(title)) {
    priority = "High";
    title = title.replace(/!+$/, "").trim();
  }
  if (!title) return false;
  const forToday = form.dataset.today === "1";
  state.tasks.push({
    id: newId(),
    title,
    group: form.dataset.group || TASK_GROUPS[0],
    line: form.dataset.line || "",
    status: TASK_STATUS.TODO,
    priority,
    week,
    due: "",
    note: "",
    nextAction: "",
    focus: "",
    today: forToday,
    todayAt: forToday ? today() : "",
    archived: false,
  });
  return true;
}

// Weekly lists: one column per task group.
function tasksView(weekTasks) {
  const columns = TASK_GROUPS.map((group) => {
    const rows = undoneFirst(weekTasks.filter((t) => t.group === group)).map(taskRow).join("");
    const add = showArchived ? "" : quickAdd("group-" + group, { group, line: group === "Skill building" ? "Interview prep" : "" });
    return `
      <div class="panel">
        <h2>${esc(group)}</h2>
        ${add}
        ${rows || empty(showArchived ? "No archived tasks this week." : "No tasks this week yet. Type one above to add it.")}
      </div>`;
  });
  return `<div class="grid">${columns.join("")}</div>`;
}
