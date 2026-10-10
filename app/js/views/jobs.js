// Jobs: the review queue ("To review"), starred jobs, and every other job
// grouped by stage.

const STAGES = [
  {
    key: "active",
    title: "In progress",
    sub: "Evaluating · Preparing",
    match: (s) => ACTIVE_STATUSES.includes(s),
    open: true,
    empty: "Nothing in progress. Click “Process” or “Prepare to apply” on a job in the review queue.",
  },
  {
    key: "applied",
    title: "Applied",
    sub: "Applied · In contact · Interviewing · Offer · Hired",
    match: (s) => APPLIED_STATUSES.includes(s),
    open: true,
    dated: true,
    empty: "No applications yet. Once you apply, set the job's stage to “Applied”.",
  },
  {
    key: "later",
    title: "Later",
    sub: "Parked for now",
    match: (s) => s === STATUS.LATER,
    open: false,
    empty: "Nothing parked.",
  },
  {
    key: "closed",
    title: "Not pursuing",
    sub: "Passed · Closed",
    match: (s) => ENDED_STATUSES.includes(s),
    open: false,
    empty: "Nothing here.",
  },
];
// Which stage panels you opened or closed, so a re-render keeps them that way.
const stageOpen = {};
// Sort order within a stage: furthest along first.
const STAGE_ORDER = {
  [STATUS.PREPARING]: 0, [STATUS.EVALUATING]: 1,
  [STATUS.OFFER]: 0, [STATUS.INTERVIEWING]: 1, [STATUS.IN_CONTACT]: 2, [STATUS.APPLIED]: 3, [STATUS.HIRED]: 4,
};
const stageRank = (j) => STAGE_ORDER[j.status] ?? 9;
const byScore = (a, b) => (b.scout?.total || 0) - (a.scout?.total || 0);

const isReviewable = (j) => !j.archived && j.status === STATUS.TO_REVIEW && inFilter(j);

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

const CODING_LABELS = { light: "light", practical: "practical", heavy: "LeetCode-style", unknown: "unknown" };

// role: "" for a single job, "top" for the best-scoring job at a company,
// "more" for the company's other jobs.
function inboxCard(j, role) {
  const s = j.scout || {};
  const roleTag = role === "top" ? '<span class="role-tag main">Top pick</span>' : role === "more" ? '<span class="role-tag">Also here</span>' : "";
  const coding = s.interview_coding
    ? `<span title="${esc(s.interview_coding_basis)}">${badge("Coding interview: " + (CODING_LABELS[s.interview_coding] || s.interview_coding))}</span>`
    : "";
  const id = esc(j.id);
  return `
    <div class="row inbox-card ${role === "more" ? "is-secondary" : ""}">
      <div class="grow">
        <div class="task-title">
          ${roleTag}${orgBadge(j)}<strong class="score">${esc(s.total ?? "—")}</strong>
          <b>${hl(j.title)}</b> — ${hl(j.detail)} ${externalLink(j.url)}
        </div>
        ${s.employer_about ? `<div class="org-about">${esc(s.employer_about)}</div>` : ""}
        <div class="meta">
          ${engineBadges(s)}${badge(j.kind)}${priorityBadge(j.priority)}
          ${badge(s.salary || "Salary not listed")}${s.eligibility ? badge("Eligibility: " + s.eligibility) : ""}
          ${gapBadges(s)}${coding}${s.location ? badge(s.location) : ""}
        </div>
        ${s.highlight ? `<div class="note"><b>Why it fits</b> ${esc(s.highlight)}</div>` : ""}
        ${s.risk ? `<div class="note"><b>Watch out</b> ${esc(s.risk)}</div>` : ""}
        <textarea class="comment" data-comment="${id}" rows="1" aria-label="Questions and notes"
          placeholder="Questions or notes for research…">${esc(j.comment || "")}</textarea>
      </div>
      <div class="inbox-actions">
        ${starButton(j, true)}
        <button class="small primary" data-act="process" data-id="${id}" title="Move to Evaluating">Process</button>
        <button class="small" data-act="apply" data-id="${id}" title="Skip evaluation and move to Preparing">Prepare to apply</button>
        <button class="small" data-act="later" data-id="${id}" title="Park it with low priority">Later</button>
        <button class="small" data-act="ignore" data-id="${id}" title="Mark as Passed">Ignore</button>
        <button class="small" data-edit="jobs:${id}">Details</button>
      </div>
    </div>`;
}

// Groups jobs by company and kind; the best score comes first.
function groupByCompany(jobs) {
  const groups = [];
  for (const j of jobs) {
    const key = (j.title || "").trim().toLowerCase() + "|" + j.kind;
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, roles: [] }));
    g.roles.push(j);
  }
  return groups;
}

function companyGroup(g) {
  const [top, ...rest] = g.roles;
  if (!rest.length) return `<div class="company-group">${inboxCard(top, "")}</div>`;
  return `
    <div class="company-group">
      ${inboxCard(top, "top")}
      <details class="secondary">
        <summary>${rest.length} more ${rest.length === 1 ? "role" : "roles"} at this company — apply to the top pick first and mention these if a recruiter asks</summary>
        ${rest.map((r) => inboxCard(r, "more")).join("")}
      </details>
    </div>`;
}

function inboxColumn(title, sub, groups, cls) {
  const count = groups.reduce((n, g) => n + g.roles.length, 0);
  return `
    <div class="panel inbox-section ${cls}">
      <div class="inbox-sec-head">
        <h2>${title}</h2>
        <span class="meta">${sub} · ${count} ${count === 1 ? "job" : "jobs"} / ${groups.length} ${groups.length === 1 ? "company" : "companies"}</span>
      </div>
      ${groups.map(companyGroup).join("") || empty("Nothing here.")}
    </div>`;
}

function reviewQueue() {
  const queue = state.jobs.filter((j) => isReviewable(j) && j.scout?.review_disposition !== "withdrawn").sort(byScore);
  if (query && !queue.length) return "";
  const groups = groupByCompany(queue);
  const fullTime = groups.filter((g) => g.roles[0].kind === "Full-time");
  const other = groups.filter((g) => g.roles[0].kind !== "Full-time");
  const hint = folder.handle ? "" : " Connect your project folder on the Data page to import new ones automatically.";
  return `
    <div class="panel accent" id="reviewQueue">
      <h2>To review · ${queue.length}</h2>
      <p class="meta">Jobs your scout found that passed your score threshold, grouped by company and sorted by score.
        <b>Process</b> moves a job to Evaluating (and asks your agent to research it);
        <b>Prepare to apply</b> skips evaluation; <b>Later</b> parks it with low priority; <b>Ignore</b> marks it as passed.</p>
      ${queue.length ? "" : empty("The review queue is empty." + hint)}
    </div>
    ${queue.length ? `
      <div class="inbox-columns">
        ${inboxColumn("Full-time", "Long-term roles", fullTime, "is-lt")}
        ${inboxColumn("Bridge & other", "Contract, fellowship, internship", other, "is-br")}
      </div>` : ""}`;
}

// Jobs the scout recommended earlier but withdrew after re-checking them.
function withdrawnPanel() {
  const jobs = state.jobs.filter((j) => isReviewable(j) && j.scout?.review_disposition === "withdrawn");
  if (!jobs.length) return "";
  const rows = jobs.map(
    (j) => `
      <div class="row">
        <div class="grow">
          ${orgBadge(j)}<b>${esc(j.title)}</b> — ${esc(j.detail)} ${engineBadges(j.scout)}
          <div class="meta">${esc(j.scout.review_previous_total ?? "—")} → ${esc(j.scout.total ?? "unscored")} / 100 · ${esc(j.scout.review_reason || "Withdrawn")}</div>
        </div>
        <button class="small" data-edit="jobs:${esc(j.id)}">Details</button>
      </div>`,
  );
  return `
    <details class="panel">
      <summary><b>Withdrawn · ${jobs.length}</b> <span class="meta">The scout re-checked these and no longer recommends them. Your notes are kept.</span></summary>
      ${rows.join("")}
    </details>`;
}

// ---------------------------------------------------------------------------
// Starred jobs
// ---------------------------------------------------------------------------

// A starred job is "handled" once you applied or decided not to pursue it.
const starHandled = (j) => APPLIED_STATUSES.includes(j.status) || ENDED_STATUSES.includes(j.status);

function starredJobs() {
  // Closest deadline (or follow-up) first.
  const when = (j) => (j.deadline && !APPLIED_STATUSES.includes(j.status) ? j.deadline : j.due || "9999");
  return state.jobs
    .filter((j) => j.starred && !j.archived)
    .sort((a, b) => when(a).localeCompare(when(b)) || byScore(a, b));
}

function starRow(j, compact) {
  const applied = APPLIED_STATUSES.includes(j.status);
  const score = j.scout?.total;
  const deadline = j.deadline && !applied ? deadlineBadge(j) : compact || applied ? "" : badge("Deadline: " + (j.deadlineBasis || "Not checked"));
  const lastNote = !compact && !applied && j.note ? `<div class="note meta">${esc(j.note.split("\n").pop().slice(0, 140))}</div>` : "";
  return `
    <div class="row star-row ${ENDED_STATUSES.includes(j.status) ? "is-closed" : ""}">
      ${starButton(j)}
      <div class="grow">
        ${orgBadge(j)}<strong>${hl(j.title)}</strong>${score != null ? ` <span class="meta">· ${esc(score)} pts</span>` : ""}
        <div class="meta">${hl(j.detail || "")}${j.url ? " · " + externalLink(j.url) : ""}</div>
        <div>
          ${badge(j.status)}${applied && j.appliedAt ? badge("Applied " + j.appliedAt) : ""}
          ${deadline}${dueBadge(j.due, "fu")}
        </div>
        ${lastNote}
      </div>
      <button class="small" data-edit="jobs:${esc(j.id)}">Open</button>
    </div>`;
}

// compact = the version on the overview page.
function starPanel(compact) {
  let all = starredJobs();
  if (!compact && query) {
    all = all.filter(matchQuery);
    if (!all.length) return "";
  }
  const todo = all.filter((j) => !starHandled(j));
  const handled = all
    .filter(starHandled)
    .sort(
      (a, b) =>
        (APPLIED_STATUSES.includes(a.status) ? 0 : 1) - (APPLIED_STATUSES.includes(b.status) ? 0 : 1) ||
        String(b.appliedAt || b.decidedAt || "").localeCompare(String(a.appliedAt || a.decidedAt || "")),
    );
  const nApplied = handled.filter((j) => APPLIED_STATUSES.includes(j.status)).length;
  const nClosed = handled.length - nApplied;
  const handledSummary = [nApplied ? `${nApplied} applied` : "", nClosed ? `${nClosed} not pursuing` : ""].filter(Boolean).join(" · ");
  const head = `<h2>★ Starred · ${todo.length} to do${handled.length ? ` <span class="star-head-done">· ${handled.length} handled</span>` : ""}</h2>`;
  const none = all.length ? "All your starred jobs are handled." : "No starred jobs yet. Click ☆ next to a job you really like.";

  if (compact) {
    const more = todo.length > 6 ? `${todo.length - 6} more to do` : "";
    const folded = handled.length ? `${handled.length} handled (${handledSummary}) hidden` : "";
    const footer = more || folded
      ? `<p class="meta">${[more, folded].filter(Boolean).join("; ")} <button class="small linkish" data-view="jobs" data-jump="star">See all ›</button></p>`
      : "";
    return `
      <div class="panel star-panel" id="starPanel">
        ${head}
        <p class="meta">Starred jobs you have not applied to or dropped yet, closest deadline first.</p>
        ${todo.slice(0, 6).map((j) => starRow(j, true)).join("") || empty(none)}
        ${footer}
      </div>`;
  }
  const handledOpen = query ? true : !!stageOpen.stardone;
  return `
    <div class="panel star-panel" id="starPanel">
      ${head}
      <p class="meta"><b>To do</b> lists starred jobs you have not applied to or dropped, closest deadline first.
        Once you apply or stop pursuing one, it moves to <b>Handled</b> below. Click ☆ to star or unstar.</p>
      ${todo.map((j) => starRow(j, false)).join("") || empty(query && all.length ? "No starred jobs to do match your search." : none)}
      ${handled.length ? `
        <details class="star-done" data-stage="stardone" ${handledOpen ? "open" : ""}>
          <summary><b>Handled · ${handled.length}</b> <span class="meta">${handledSummary}</span></summary>
          ${handled.map((j) => starRow(j, false)).join("")}
        </details>` : ""}
    </div>`;
}

// ---------------------------------------------------------------------------
// Stage sections
// ---------------------------------------------------------------------------

function jobRow(j, dated) {
  const appliedCell = dated
    ? `<td class="nowrap">${j.appliedAt ? esc(j.appliedAt) : j.decidedAt ? esc(j.decidedAt) + '<div class="meta">stage changed</div>' : '<span class="meta">not recorded</span>'}</td>`
    : "";
  return `
    <tr>
      <td>${orgBadge(j)}<strong>${hl(j.title)}</strong><div class="meta">${hl(j.detail)}${j.url ? " · " + externalLink(j.url) : ""}</div></td>
      <td>${esc(j.market)}<div class="meta">${esc(j.kind)}</div></td>
      <td>${scoreCell(j)}</td>
      <td>${badge(j.status)}${dated ? "" : priorityBadge(j.priority)}</td>
      ${appliedCell}
      <td>${dueBadge(j.due) || '<span class="meta">not set</span>'}${j.deadline && !APPLIED_STATUSES.includes(j.status) ? `<div>${deadlineBadge(j)}</div>` : ""}</td>
      <td class="nowrap">${starButton(j)} <button class="small" data-edit="jobs:${esc(j.id)}">Open</button></td>
    </tr>`;
}

function stageSection(stage, jobs) {
  const rows = jobs.filter((j) => stage.match(j.status));
  rows.sort(
    stage.dated
      ? (a, b) => String(b.appliedAt || b.decidedAt || "").localeCompare(String(a.appliedAt || a.decidedAt || "")) || stageRank(a) - stageRank(b)
      : (a, b) => stageRank(a) - stageRank(b) || byScore(a, b),
  );
  if (query && !rows.length) return "";
  const isOpen = query ? true : (stageOpen[stage.key] ?? stage.open);
  const table = `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Company / role</th><th>Region / type</th><th>Score</th><th>Stage</th>
        ${stage.dated ? "<th>Applied on</th>" : ""}<th>Follow-up / deadline</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows.map((j) => jobRow(j, stage.dated)).join("")}</tbody>
    </table></div>`;
  return `
    <details class="panel stage-panel stage-${stage.key}" data-stage="${stage.key}" ${isOpen ? "open" : ""}>
      <summary><b>${stage.title} · ${rows.length}</b> <span class="meta">${stage.sub}</span></summary>
      ${rows.length ? table : empty(stage.empty)}
    </details>`;
}

// ---------------------------------------------------------------------------
// Search summary and the page itself
// ---------------------------------------------------------------------------

function searchSummary(live, archivedHits) {
  const buckets = [
    ["to review", (j) => j.status === STATUS.TO_REVIEW],
    ["in progress", (j) => ACTIVE_STATUSES.includes(j.status)],
    ["applied", (j) => APPLIED_STATUSES.includes(j.status)],
    ["later", (j) => j.status === STATUS.LATER],
    ["not pursuing", (j) => ENDED_STATUSES.includes(j.status)],
  ];
  const parts = buckets.map(([name, f]) => [name, live.filter(f).length]).filter(([, n]) => n).map(([name, n]) => `${n} ${name}`);
  const starred = live.filter((j) => j.starred).length;
  const help = live.length
    ? "Matches are shown below; collapsed sections are expanded and matching text is highlighted."
    : "No matching jobs. Try another word, or part of a company name.";
  return `
    <div class="panel search-summary">
      <b>Search “${esc(query)}”: ${live.length} ${live.length === 1 ? "job" : "jobs"}</b>
      ${live.length ? `<span class="meta"> ${parts.join(" · ")}${starred ? ` · ${starred} starred` : ""}</span>` : ""}
      <div class="meta">${help}
        ${archivedHits ? ` ${archivedHits} archived ${archivedHits === 1 ? "job matches" : "jobs match"} too; tick “Show archived” to see them.` : ""}
        ${region ? ` Showing region “${esc(region)}” only.` : ""}</div>
    </div>`;
}

// Returns { html, hits } so the toolbar can show the number of matches.
function jobsView() {
  const jobs = state.jobs.filter((j) => !!j.archived === showArchived && inFilter(j));
  if (showArchived) {
    return { html: archivedJobsPanel(jobs), hits: jobs.length };
  }
  const browsed = jobs.filter((j) => j.status !== STATUS.TO_REVIEW);
  const unmatched = browsed.filter((j) => !STAGES.some((s) => s.match(j.status)));
  let summary = "";
  let hits = 0;
  if (query) {
    const pool = state.jobs.filter(inFilter);
    const live = pool.filter((j) => !j.archived);
    hits = live.length;
    summary = searchSummary(live, pool.length - live.length);
  }
  const html =
    summary +
    starPanel(false) +
    reviewQueue() +
    withdrawnPanel() +
    STAGES.map((s) => stageSection(s, browsed)).join("") +
    (unmatched.length ? stageSection({ key: "other", title: "Other stages", sub: "", match: () => true, open: true, empty: "" }, unmatched) : "");
  return { html, hits };
}

function archivedJobsPanel(jobs) {
  const rows = jobs.sort(byScore).map(
    (j) => `
      <tr>
        <td>${orgBadge(j)}<strong>${hl(j.title)}</strong><div class="meta">${hl(j.detail)}${j.url ? " · " + externalLink(j.url) : ""}</div></td>
        <td>${esc(j.market)}<div class="meta">${esc(j.kind)}</div></td>
        <td>${scoreCell(j)}</td>
        <td>${badge(j.status)}</td>
        <td><button class="small" data-edit="jobs:${esc(j.id)}">Open</button></td>
      </tr>`,
  );
  return `
    <div class="panel">
      <h2>Archived jobs</h2>
      <p class="meta">Archived jobs are hidden everywhere else. Open one and click “Restore” to bring it back.</p>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Company / role</th><th>Region / type</th><th>Score</th><th>Stage</th><th>Actions</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>` : empty("No archived jobs.")}
    </div>`;
}

// ---------------------------------------------------------------------------
// The scout section of the job editor
// ---------------------------------------------------------------------------

function scoutDetail(j) {
  const s = j.scout || {};
  const r = s.research || {};
  const kv = (k, v) => (v ? `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>` : "");
  const engines = sourceEngines(s);
  const comparison = engines.length > 1
    ? `<div class="source-comparison">${engines
        .map((e) => {
          const q = (s.engine_scores || {})[e];
          return q ? `<div>${engineBadge(e)} ${esc(q.total ?? "—")}/100 · ${scoreParts(q)}</div>` : "";
        })
        .join("")}</div>`
    : "";
  const sources = (r.sources || [])
    .map((u) => externalLink(u, esc(String(u).replace(/^https?:\/\//, "").slice(0, 60))))
    .join("<br>");
  const research = r.checked_at
    ? `<span class="meta"> · ${esc(r.checked_at)}</span>
       ${kv("Funding", esc(r.funding))}${kv("Team", esc(r.team))}${kv("How to apply", esc(r.apply_strategy))}
       ${kv("Your questions", esc(r.answers))}${kv("Other notes", esc(r.notes))}${kv("Sources", sources)}`
    : '<div class="meta">Not researched yet. Ask your agent to research the jobs you marked Evaluating; its notes appear here.</div>';
  const org = s.employer_type || s.employer_about
    ? `<div class="org-detail">${orgBadge(j)}${s.employer_about ? `<div class="org-about"><b>About</b> ${esc(s.employer_about)}</div>` : ""}</div>`
    : "";
  return `
    ${org}
    <div class="scout-head">
      <strong class="score">${esc(s.total ?? "—")}</strong>
      <span class="meta">Interest ${esc(s.interest ?? "—")} · Capability ${esc(s.capability ?? "—")} · Attainability ${esc(s.attainability ?? "—")} · Role quality ${esc(s.role_quality ?? "—")}</span>
    </div>
    ${kv("Location", esc(s.location))}
    ${kv("Salary", esc(s.salary || "Not listed"))}
    ${kv("Eligibility", esc(s.eligibility || "Not stated"))}
    ${kv("Posted", esc(s.posted_at || "Unknown") + (s.stale_risk ? " (older posting — check that it is still open)" : ""))}
    ${kv("Gaps to close", (s.gap_flags || []).map((g) => badge(g)).join(""))}
    ${kv("<b>Why it fits</b>", esc(s.highlight))}
    ${kv("<b>Watch out</b>", esc(s.risk))}
    ${kv("Posting", j.url ? externalLink(j.url, esc(j.url)) : "")}
    ${kv("Source", engineBadges(s) + (s.run_id ? `<span class="meta">${esc(s.run_id)}</span>` : ""))}
    ${s.review_disposition === "withdrawn" ? kv("Withdrawn", esc(s.review_reason || "")) : ""}
    ${comparison}
    ${kv("<b>Your notes</b>", esc(j.comment))}
    <div class="research"><b>Research</b>${research}</div>`;
}
