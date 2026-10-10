// Importing scout results into the dashboard. Pure functions (no DOM), loaded
// after model.js. The file formats are documented in docs/data-formats.md.

// Dashboard job IDs are derived from the scout's opportunity_id, so importing
// the same inbox twice updates the job instead of duplicating it.
function scoutJobId(opportunityId) {
  return "scout-" + String(opportunityId).replace(/[^a-zA-Z0-9_-]/g, "-");
}

// Engine names are free text ("claude", "my-gpt-agent", ...); keep them short and tidy.
function engineName(value) {
  return String(value || "").trim().slice(0, 40);
}

function jobKindFor(category) {
  const c = String(category || "").toLowerCase();
  if (/bridge|contract|fellow|temp|residency/.test(c)) return "Bridge";
  if (/intern/.test(c)) return "Internship";
  return "Full-time";
}

function scoreSnapshot(s) {
  return {
    total: s.total ?? null,
    interest: s.interest ?? null,
    capability: s.capability ?? null,
    attainability: s.attainability ?? null,
    role_quality: s.role_quality ?? null,
    run_id: s.run_id || "",
  };
}

// Engines that recommended a job. `source_engines` lists every engine that
// has suggested it; `engine_scores` keeps each engine's own scores.
function sourceEngines(scout) {
  if (!scout) return [];
  const list = Array.isArray(scout.source_engines) ? scout.source_engines : [scout.engine];
  return [...new Set(list.map(engineName).filter(Boolean))];
}

function scoutFromInbox(r, box) {
  const scout = {
    opportunity_id: r.opportunity_id,
    review_disposition: "recommended",
    review_outcome: null,
    review_reason: "",
    total: r.score_total,
    interest: r.scores?.interest,
    capability: r.scores?.capability,
    attainability: r.scores?.attainability,
    role_quality: r.scores?.role_quality,
    salary: r.salary_text || "",
    salary_flag: r.salary_flag || null,
    eligibility: r.eligibility || "",
    gap_flags: Array.isArray(r.gap_flags) ? r.gap_flags : [],
    interview_coding: r.interview_coding || "",
    interview_coding_basis: r.interview_coding_basis || "",
    employer_type: r.employer_type || "",
    employer_category: r.employer_category || "",
    employer_about: r.employer_about || "",
    engine: engineName(r.engine || box.generated_by),
    posted_at: r.posted_at || "",
    stale_risk: !!r.stale_risk,
    location: r.location || "",
    highlight: r.highlight || "",
    risk: r.risk || "",
    run_id: r.run_id || box.run_id || "",
  };
  scout.source_engines = scout.engine ? [scout.engine] : [];
  scout.engine_scores = scout.engine ? { [scout.engine]: scoreSnapshot(scout) } : {};
  return scout;
}

function newJobFromInbox(r, scout, todayStr) {
  return {
    id: scoutJobId(r.opportunity_id),
    title: r.employer,
    detail: r.title,
    market: r.market || "",
    kind: jobKindFor(r.category),
    status: STATUS.TO_REVIEW,
    priority: (r.score_total || 0) >= 80 ? "High" : "Medium",
    url: r.url || "",
    due: "",
    deadline: r.deadline || "",
    deadlineBasis: r.deadline ? r.deadline_basis || "Posted" : "",
    note: "",
    archived: false,
    today: false,
    scout,
    importedAt: todayStr,
  };
}

// Refreshes the scout data of a job that is already on the dashboard. Your own
// fields (status, notes, dates) are never touched; a deadline is only filled in
// if you have not set one.
function refreshJob(job, r, scout) {
  const prior = job.scout || {};
  const priorScores =
    prior.engine_scores || (engineName(prior.engine) ? { [engineName(prior.engine)]: scoreSnapshot(prior) } : {});
  if (r.deadline && !job.deadline) {
    job.deadline = r.deadline;
    job.deadlineBasis = r.deadline_basis || "Posted";
  }
  job.scout = {
    ...prior,
    ...scout,
    source_engines: [...new Set([...sourceEngines(prior), ...scout.source_engines])],
    engine_scores: { ...priorScores, ...scout.engine_scores },
  };
}

// A revision withdraws an earlier recommendation after the scout re-checked it:
// "below" (score dropped under the threshold) or "triaged_out" (e.g. the role
// closed or turned out to be ineligible). The job stays, marked as withdrawn.
function withdrawJob(job, r, box) {
  const prior = job.scout || {};
  const engine = engineName(r.engine || box.generated_by || prior.engine);
  const scores = scoreSnapshot({
    total: r.score_total,
    ...(r.scores || {}),
    run_id: r.run_id || box.run_id || "",
  });
  job.scout = {
    ...prior,
    review_disposition: "withdrawn",
    review_outcome: r.disposition,
    review_reason: r.review_reason || "",
    review_previous_total: r.previous_score ?? prior.total ?? null,
    total: scores.total,
    interest: scores.interest,
    capability: scores.capability,
    attainability: scores.attainability,
    role_quality: scores.role_quality,
    eligibility: r.eligibility || prior.eligibility || "",
    gap_flags: Array.isArray(r.gap_flags) ? r.gap_flags : prior.gap_flags || [],
    salary: r.salary_text || prior.salary || "",
    risk: r.risk || prior.risk || "",
    run_id: scores.run_id,
    source_engines: [...new Set([...sourceEngines(prior), engine].filter(Boolean))],
    engine_scores: { ...(prior.engine_scores || {}), ...(engine ? { [engine]: scores } : {}) },
  };
}

// Merges one parsed inbox file into the state. Returns what changed.
function importInbox(state, box, todayStr = today()) {
  const result = { added: 0, updated: 0, withdrawn: 0 };
  if (!box || typeof box !== "object") return result;
  for (const r of Array.isArray(box.jobs) ? box.jobs : []) {
    if (!r || !r.opportunity_id || !r.employer || !r.title) continue;
    const scout = scoutFromInbox(r, box);
    const existing = state.jobs.find((j) => j.id === scoutJobId(r.opportunity_id));
    if (existing) {
      refreshJob(existing, r, scout);
      result.updated++;
    } else {
      state.jobs.push(newJobFromInbox(r, scout, todayStr));
      result.added++;
    }
  }
  for (const r of Array.isArray(box.revisions) ? box.revisions : []) {
    if (!r || !r.opportunity_id || !["below", "triaged_out"].includes(r.disposition)) continue;
    const existing = state.jobs.find((j) => j.id === scoutJobId(r.opportunity_id));
    if (!existing) continue;
    withdrawJob(existing, r, box);
    result.withdrawn++;
  }
  return result;
}

// Attaches research notes ({ items: { <opportunity_id>: {...} } }) to the
// matching jobs. Returns the number of jobs whose notes changed.
function importResearch(state, research) {
  const items = (research && research.items) || {};
  let changed = 0;
  for (const job of state.jobs) {
    const notes = job.scout?.opportunity_id && items[job.scout.opportunity_id];
    if (notes && JSON.stringify(job.scout.research || null) !== JSON.stringify(notes)) {
      job.scout.research = notes;
      changed++;
    }
  }
  return changed;
}
