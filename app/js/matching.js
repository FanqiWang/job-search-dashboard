// Text matching: the search box, and linking tasks to the jobs they are about.
// Pure functions (no DOM), loaded after model.js.

// ---------------------------------------------------------------------------
// Search: every space-separated term must appear somewhere in the record.
// ---------------------------------------------------------------------------

function searchTerms(query) {
  return String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
}

function searchText(x) {
  const s = x.scout || {};
  return [
    x.title, x.detail, x.market, x.kind, x.status, x.priority && x.priority + " priority",
    x.comment, x.note, x.url, s.location, s.highlight, s.risk, s.employer_type, s.salary, s.opportunity_id,
  ]
    .filter(Boolean)
    .join(" \u0001 ")
    .toLowerCase();
}

function matchesQuery(x, terms) {
  if (!terms.length) return true;
  const text = searchText(x);
  return terms.every((t) => text.includes(t));
}

// ---------------------------------------------------------------------------
// Task <-> job links
//
// A task can be linked to jobs in three ways (first match wins):
//   1. task.jobIds === "none"   -> explicitly not linked;
//   2. task.jobIds = "id1,id2"  -> picked by hand in the task editor;
//   3. otherwise, automatically: if the task title sounds like application
//      work ("apply", "interview", ...) and mentions a company you track.
// ---------------------------------------------------------------------------

const APPLY_WORDS =
  /\b(apply|applying|application|interview|interviews|onsite|offer|referral|recruiter|follow[- ]?up|cover letter|take-home|resume|portfolio)\b/i;
// Words too generic to identify a company on their own.
const COMPANY_STOPWORDS = [
  "the", "research", "institute", "national", "university", "labs", "lab", "laboratory", "center", "centre",
  "company", "group", "team", "applied", "open", "data", "inc", "llc", "ltd", "co",
];

// Company name without a parenthetical, e.g. "Acme Robotics (ACR)" -> "acme robotics".
function companyBase(job) {
  return String(job.title || "").toLowerCase().replace(/\s*\([^)]*\)\s*/g, " ").trim();
}

// Strings that identify a job's company in free text: the full name, the name
// without parentheses, an abbreviation in parentheses, and a distinctive first word.
function companyKeys(job) {
  const full = String(job.title || "").toLowerCase().trim();
  const base = companyBase(job);
  const keys = new Set([full, base]);
  for (const m of full.matchAll(/\(([^)]+)\)/g)) {
    const abbr = m[1].trim();
    if (abbr.length >= 3 && !/[·,]/.test(abbr)) keys.add(abbr);
  }
  const first = base.split(/\s+/)[0];
  if (first && first.length >= 3 && !COMPANY_STOPWORDS.includes(first)) keys.add(first);
  keys.delete("");
  return [...keys];
}

// True when `word` appears in `text` with no letter or digit directly around it.
function hasWord(text, word) {
  for (let i = text.indexOf(word); i >= 0; i = text.indexOf(word, i + 1)) {
    const before = text.charAt(i - 1);
    const after = text.charAt(i + word.length);
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
  }
  return false;
}

function autoLinkedJobs(task, jobs) {
  if (!APPLY_WORDS.test(task.title || "")) return [];
  const live = jobs.filter((j) => !j.archived && !ENDED_STATUSES.includes(j.status));
  // Look at the title first; only fall back to the "next action" text if the title names no company.
  for (const text of [task.title || "", (task.title || "") + " " + (task.nextAction || "")]) {
    const lower = text.toLowerCase();
    const hits = live.filter((j) => companyKeys(j).some((k) => hasWord(lower, k)));
    if (!hits.length) continue;

    // Within each company, prefer the roles whose title words appear in the task.
    const byCompany = {};
    for (const j of hits) (byCompany[companyBase(j)] = byCompany[companyBase(j)] || []).push(j);
    const roleScore = (j) =>
      String(j.detail || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !COMPANY_STOPWORDS.includes(w) && hasWord(lower, w)).length;
    const out = [];
    for (const list of Object.values(byCompany)) {
      const best = Math.max(...list.map(roleScore));
      let picks = list.filter((j) => roleScore(j) === best);
      if (picks.length > 2) {
        const engaged = picks.filter(
          (j) => j.starred || ACTIVE_STATUSES.includes(j.status) || APPLIED_STATUSES.includes(j.status),
        );
        if (engaged.length) picks = engaged;
      }
      picks.sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || (b.scout?.total || 0) - (a.scout?.total || 0));
      out.push(...picks.slice(0, 2));
    }
    return out.slice(0, 4);
  }
  return [];
}

// Returns { jobs, mode } where mode is "off", "manual" or "auto".
function linkedJobs(task, jobs) {
  if (task.jobIds === "none") return { jobs: [], mode: "off" };
  if (task.jobIds) {
    const picked = task.jobIds
      .split(",")
      .map((id) => jobs.find((j) => j.id === id.trim()))
      .filter(Boolean);
    return { jobs: picked, mode: "manual" };
  }
  return { jobs: autoLinkedJobs(task, jobs), mode: "auto" };
}

// A short label for a job chip: the company (or its abbreviation), plus the
// role when several linked jobs share a company.
function jobShortName(job, siblings) {
  const abbr = (String(job.title || "").match(/\(([^)·,]{2,12})\)/) || [])[1];
  const company = (abbr || String(job.title || "").replace(/\s*\([^)]*\)\s*/g, "")).trim() || job.title;
  const twin = siblings.filter((x) => companyBase(x) === companyBase(job)).length > 1;
  return twin ? `${company} · ${String(job.detail || "").slice(0, 22)}` : company;
}
