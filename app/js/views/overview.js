// Overview: today's focus, this week's progress, starred jobs, upcoming
// deadlines, follow-ups that are due, and one panel per workstream.

// Jobs and contacts whose "next follow-up" date is today or earlier.
function dueFollowUps() {
  return [...state.jobs, ...state.contacts].filter(
    (x) => !x.archived && x.due && x.due <= today() && !FOLLOW_UP_DONE.includes(x.status),
  );
}

function followUpRow(x) {
  const kind = state.jobs.includes(x) ? "jobs" : "contacts";
  return `
    <div class="row">
      <div class="grow">
        ${esc(x.title)}${x.detail ? `<div class="meta">${esc(x.detail)}</div>` : ""}
        <div>${dueBadge(x.due)}${x.status ? badge(x.status) : ""}</div>
      </div>
      <button class="small" data-edit="${kind}:${esc(x.id)}">Open</button>
    </div>`;
}

function workstreamPanel(line) {
  const tasks = state.tasks.filter((t) => !t.archived && t.line === line && taskInWeek(t, week));
  const open = tasks.filter((t) => !isDone(t));
  const urgent = open.filter((t) => t.priority === "High");
  const shown = [...(urgent.length ? urgent : open).slice(0, 3), ...tasks.filter(doneToday)];
  const inProgress = tasks.filter((t) => t.status === TASK_STATUS.IN_PROGRESS).length;
  const blocked = tasks.filter((t) => t.status === TASK_STATUS.BLOCKED).length;
  const group = line === "Interview prep" ? "Skill building" : "Job search";
  return `
    <div class="panel">
      <h2>${esc(line)}</h2>
      <div class="meta">${inProgress} in progress · ${blocked} blocked</div>
      ${quickAdd("line-" + line, { line, group })}
      ${shown.map(taskRow).join("") || empty("Nothing open here this week.")}
    </div>`;
}

function overviewView(weekTasks) {
  const done = weekTasks.filter(isDone).length;
  const pct = weekTasks.length ? (100 * done) / weekTasks.length : 0;
  const todayTasks = state.tasks.filter((t) => !t.archived && t.today && (!isDone(t) || doneToday(t)));
  const soon = upcomingDeadlines(state);
  const follow = dueFollowUps();
  return `
    <div class="grid">
      <div class="panel">
        <h2>Today</h2>
        ${quickAdd("today", { today: true })}
        ${undoneFirst(todayTasks).map(taskRow).join("") || empty("Nothing picked for today yet. Type a task above, or click ☆ on any task in the weekly lists.")}
      </div>
      <div>
        <div class="panel accent">
          <h2>This week</h2>
          <div class="progress"><div style="width:${pct}%"></div></div>
          <p class="meta">${done} of ${weekTasks.length} tasks done this week · progress, not an application quota</p>
        </div>
        ${starPanel(true)}
        <div class="panel" id="soonPanel">
          <h2>Deadlines in the next two weeks</h2>
          <p class="meta">Jobs you have not applied to yet whose deadline is within 14 days (or already passed).
            <button class="small linkish" data-view="calendar">Open calendar ›</button></p>
          ${soon.map(calendarRow).join("") || empty("No known deadlines in the next two weeks. Jobs without a deadline are listed at the bottom of the Calendar page.")}
        </div>
        <div class="panel" id="followPanel">
          <h2>Follow-ups due</h2>
          <p class="meta">Jobs and contacts whose “next follow-up” date is today or earlier.</p>
          ${follow.map(followUpRow).join("") || empty("No follow-ups due.")}
        </div>
      </div>
    </div>
    <div class="grid workstreams">${TASK_LINES.map(workstreamPanel).join("")}</div>`;
}
