// Small HTML building blocks shared by the views. Every value that comes from
// data goes through esc() before it is put into markup.

const $ = (selector) => document.querySelector(selector);

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

// Escapes a value and highlights the current search terms in it.
function hl(value) {
  const html = esc(value);
  const terms = searchTerms(query);
  if (!terms.length) return html;
  const re = new RegExp("(" + terms.map((t) => esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
  // Split out HTML entities so a search for "amp" does not break "&amp;".
  return html
    .split(/(&[a-z0-9#]+;)/i)
    .map((part) => (/^&[a-z0-9#]+;$/i.test(part) ? part : part.replace(re, "<mark>$1</mark>")))
    .join("");
}

function badge(text, cls = "") {
  return `<span class="badge ${cls}">${esc(text)}</span>`;
}

function priorityBadge(priority) {
  return priority ? badge(priority + " priority", "prio-" + priority.toLowerCase()) : "";
}

function empty(html) {
  return `<div class="empty">${html}</div>`;
}

function externalLink(url, label = "Posting ↗") {
  return url ? `<a class="ext" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : "";
}

// "MM/DD" for compact displays.
function shortDate(dateStr) {
  return String(dateStr || "").slice(5).replace("-", "/");
}

function formatLongDate(date) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}

function formatTime(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// "Today", "3 days left", "2 days ago".
function daysLeftText(dateStr) {
  const n = dayDiff(dateStr);
  if (n === 0) return "Today";
  if (n > 0) return n === 1 ? "1 day left" : `${n} days left`;
  return n === -1 ? "1 day ago" : `${-n} days ago`;
}

// A follow-up date badge, red once it has passed.
function dueBadge(dateStr, cls = "") {
  if (!dateStr) return "";
  const late = dateStr < today();
  return badge(dateStr + (late ? " · overdue" : ""), (late ? "late " : "") + cls);
}

// An application deadline badge: red once missed, amber within two weeks.
function deadlineBadge(job) {
  const n = dayDiff(job.deadline);
  const cls = n < 0 ? "late" : n <= 14 ? "dl-soon" : "";
  const basis = job.deadlineBasis && job.deadlineBasis !== "Posted" ? ` (${job.deadlineBasis.toLowerCase()})` : "";
  return badge(`Deadline ${job.deadline} · ${daysLeftText(job.deadline)}${basis}`, "dl " + cls);
}

function starButton(job, withLabel = false) {
  const label = withLabel ? (job.starred ? " Starred" : " Star") : "";
  return `<button class="small star-btn ${job.starred ? "on" : ""}" data-star="${esc(job.id)}"
    title="${job.starred ? "Remove from starred" : "Star this job"}"
    aria-pressed="${job.starred ? "true" : "false"}">${job.starred ? "★" : "☆"}${label}</button>`;
}

// Engine badges get a stable color derived from the engine's name.
function engineBadge(engine) {
  let hash = 0;
  for (const ch of engine) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="source-badge source-${hash % 6}" title="Suggested by ${esc(engine)}">${esc(engine)}</span>`;
}

function engineBadges(scout) {
  return sourceEngines(scout).map(engineBadge).join("");
}

const EMPLOYER_CATEGORIES = ["startup", "growth", "enterprise", "research", "public", "nonprofit"];

// A colored badge with the employer type, e.g. "Robotics startup".
function orgBadge(job) {
  const s = job.scout || {};
  if (!s.employer_type) return "";
  const cat = EMPLOYER_CATEGORIES.includes(s.employer_category) ? s.employer_category : "other";
  return `<span class="org-badge org-${cat}" title="${esc(s.employer_about)}">${esc(s.employer_type)}</span>`;
}

function scoreParts(s) {
  return [s.interest, s.capability, s.attainability, s.role_quality].map((v) => esc(v ?? "—")).join("/");
}

function gapBadges(scout) {
  return (scout.gap_flags || []).map((g) => badge("Gap: " + g)).join("");
}

// Score column in job tables: total, the four parts, gaps and sources.
function scoreCell(job) {
  const s = job.scout;
  if (!s) return '<span class="meta">—</span>';
  return `
    <strong class="score">${esc(s.total ?? "—")}</strong>
    ${s.review_disposition === "withdrawn" ? badge("Withdrawn") : ""}
    <div class="meta">${scoreParts(s)} ${gapBadges(s)}</div>
    <div class="source-inline">${engineBadges(s)}</div>`;
}
