// Calendar: application deadlines and your own follow-up dates, as lists by
// urgency plus a month grid.

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TYPE_LABELS = { deadline: "Deadline", follow: "Follow-up" };

function calendarRow(item) {
  const x = item.x;
  const n = dayDiff(item.date);
  const basis = item.type === "deadline" && x.deadlineBasis && x.deadlineBasis !== "Posted" ? badge(x.deadlineBasis) : "";
  return `
    <div class="row cal-row ${item.type}">
      <div class="cal-date ${n < 0 ? "past" : n <= 14 ? "soon" : ""}"><b>${esc(shortDate(item.date))}</b><span>${daysLeftText(item.date)}</span></div>
      <div class="grow">
        <span class="cal-type ${item.type}">${TYPE_LABELS[item.type]}</span>${item.kind === "jobs" ? orgBadge(x) : ""}<strong>${esc(x.title)}</strong>
        ${x.detail ? `<div class="meta">${esc(x.detail)}</div>` : ""}
        <div>${badge(x.status)}${basis}${x.url ? " " + externalLink(x.url) : ""}</div>
      </div>
      ${item.kind === "jobs" ? starButton(x) : ""}
      <button class="small" data-edit="${item.kind}:${esc(x.id)}">Open</button>
    </div>`;
}

function monthGrid(items) {
  const [y, m] = calMonth.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const leadingBlanks = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  let cells = '<div class="cal-cell blank"></div>'.repeat(leadingBlanks);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${calMonth}-${String(d).padStart(2, "0")}`;
    const chips = items
      .filter((i) => i.date === date)
      .map(
        (i) => `<button class="cal-chip ${i.type}" data-edit="${i.kind}:${esc(i.x.id)}"
          title="${esc(TYPE_LABELS[i.type] + " · " + i.x.title + " " + (i.x.detail || ""))}">${esc(i.x.title)}</button>`,
      )
      .join("");
    cells += `<div class="cal-cell ${date === today() ? "is-today" : ""}"><span class="cal-num">${d}</span>${chips}</div>`;
  }
  const title = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return `
    <div class="panel">
      <div class="cal-head">
        <h2>${title}</h2>
        <div>
          <button class="small" data-cal-month="-1">‹ Previous</button>
          <button class="small" data-cal-month="0">This month</button>
          <button class="small" data-cal-month="1">Next ›</button>
        </div>
      </div>
      <div class="cal-legend"><span class="cal-type deadline">Deadline</span><span class="cal-type follow">Follow-up</span></div>
      <div class="cal-grid">${WEEKDAYS.map((w) => `<div class="cal-wd">${w}</div>`).join("")}${cells}</div>
    </div>`;
}

function calendarSection(id, title, sub, items, cls) {
  return `
    <div class="panel cal-sec ${cls}" ${id ? `id="${id}"` : ""}>
      <h2>${title} · ${items.length}</h2>
      ${sub ? `<p class="meta">${sub}</p>` : ""}
      ${items.map(calendarRow).join("") || empty("Nothing here.")}
    </div>`;
}

function calendarView() {
  const items = calendarItems(state);
  const within = (lo, hi) => items.filter((i) => dayDiff(i.date) >= lo && dayDiff(i.date) <= hi);
  const past = items.filter((i) => dayDiff(i.date) < 0);
  const later = items.filter((i) => dayDiff(i.date) > 60);
  const noDeadline = state.jobs.filter(
    (j) => !j.archived && [...ACTIVE_STATUSES, STATUS.LATER].includes(j.status) && !j.deadline,
  );
  const unreviewed = state.jobs.filter((j) => !j.archived && j.status === STATUS.TO_REVIEW && !j.deadline).length;
  const noDeadlineRows = noDeadline.map(
    (j) => `
      <div class="row">
        <div class="grow">
          ${orgBadge(j)}<strong>${esc(j.title)}</strong><div class="meta">${esc(j.detail || "")}</div>
          <div>${badge(j.status)}${badge(j.deadlineBasis || "Not checked")}</div>
        </div>
        <button class="small" data-edit="jobs:${esc(j.id)}">Add deadline</button>
      </div>`,
  );
  return `
    <div class="panel accent">
      <h2>Deadlines and follow-ups</h2>
      <p class="meta">Two kinds of dates: a <b>deadline</b> is the employer's last day to apply (no more reminders once you apply);
        a <b>follow-up</b> is a date you set yourself to check back. Add both in a job's editor, and note where the deadline
        came from (posted, estimated from past years, or rolling).</p>
    </div>
    ${calendarSection("", "Overdue", "Missed deadlines and past follow-ups: update the date or the stage.", past, "past")}
    ${calendarSection("calSoon", "Next two weeks", "Including today. Plan these first.", within(0, 14), "soon")}
    ${calendarSection("", "15–60 days", "", within(15, 60), "")}
    ${later.length ? calendarSection("", "More than 60 days", "", later, "") : ""}
    ${monthGrid(items)}
    <div class="panel">
      <h2>No deadline yet · ${noDeadline.length}</h2>
      <p class="meta">Jobs in progress or parked without a deadline. “Rolling” means the posting gives none and usually
        closes when filled, so apply early. ${unreviewed} jobs still to review are not listed.</p>
      ${noDeadlineRows.join("") || empty("Every job has a deadline.")}
    </div>`;
}
