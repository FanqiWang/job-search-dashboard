// Data model: the vocabulary of statuses and fields, date helpers, and the
// shape of the saved state. Everything here is pure (no DOM access), so it can
// be loaded and tested in Node (see tests/js).

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const STATUS = {
  TO_REVIEW: "To review",
  EVALUATING: "Evaluating",
  PREPARING: "Preparing",
  APPLIED: "Applied",
  IN_CONTACT: "In contact",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  HIRED: "Hired",
  LATER: "Later",
  PASSED: "Passed",
  CLOSED: "Closed",
};
const JOB_STATUSES = Object.values(STATUS);

// Jobs you are actively working on but have not applied to yet.
const ACTIVE_STATUSES = [STATUS.EVALUATING, STATUS.PREPARING];
// "Applied" and everything that can happen after it.
const APPLIED_STATUSES = [STATUS.APPLIED, STATUS.IN_CONTACT, STATUS.INTERVIEWING, STATUS.OFFER, STATUS.HIRED];
// Jobs you decided not to pursue, or that ended.
const ENDED_STATUSES = [STATUS.PASSED, STATUS.CLOSED];
// Jobs whose dates no longer belong on the calendar.
const OFF_CALENDAR_STATUSES = [STATUS.PASSED, STATUS.CLOSED, STATUS.HIRED];

const TASK_STATUS = { TODO: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", DONE: "Done" };
const TASK_STATUSES = Object.values(TASK_STATUS);
const PRIORITIES = ["High", "Medium", "Low"];
// The two weekly lists.
const TASK_GROUPS = ["Job search", "Skill building"];
// Optional workstreams shown on the overview.
const TASK_LINES = ["Materials", "Discovery", "Pipeline", "Interview prep"];

// "Bridge" covers contract, fellowship and other short-term roles that lead somewhere.
const JOB_KINDS = ["Full-time", "Bridge", "Internship", "Other"];
const DEADLINE_BASES = ["Not checked", "Posted", "Estimated", "Rolling"];

const CONTACT_STATUS = {
  TO_CONTACT: "To contact",
  CONTACTED: "Contacted",
  AWAITING: "Awaiting reply",
  FOLLOW_UP: "Follow up",
  DONE: "Done",
};
const CONTACT_STATUSES = Object.values(CONTACT_STATUS);
const CONTACT_KINDS = ["Referral", "Recruiter", "Alumni", "Mentor", "Other"];

// Statuses after which a "next follow-up" date no longer needs attention.
const FOLLOW_UP_DONE = [STATUS.PASSED, STATUS.CLOSED, STATUS.HIRED, CONTACT_STATUS.DONE];

// ---------------------------------------------------------------------------
// Dates. All dates are local-time strings: "YYYY-MM-DD", weeks start on Monday.
// ---------------------------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, "0");

function isoDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDate(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function today() {
  return isoDate(new Date());
}

function addDays(dateStr, days) {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

// The Monday of the week that contains dateStr.
function mondayOf(dateStr = today()) {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return isoDate(date);
}

// Whole days from `from` to dateStr (negative when dateStr is in the past).
function dayDiff(dateStr, from = today()) {
  return Math.round((parseDate(dateStr) - parseDate(from)) / 864e5);
}

// Shift a "YYYY-MM" month string by k months.
function shiftMonth(month, k) {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(y, m - 1 + k, 1);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function emptyState() {
  return { version: 1, reviews: {}, tasks: [], jobs: [], contacts: [] };
}

const STRING_FIELDS = [
  "detail", "market", "kind", "status", "priority", "week", "due", "note", "url", "group", "line",
  "nextAction", "focus", "comment", "deadline", "deadlineBasis", "starredAt", "jobIds",
];
const BOOLEAN_FIELDS = ["archived", "today", "starred"];

function isValidRecord(x) {
  return (
    !!x &&
    typeof x.id === "string" &&
    /^[a-zA-Z0-9_-]+$/.test(x.id) &&
    typeof x.title === "string" &&
    STRING_FIELDS.every((f) => x[f] === undefined || typeof x[f] === "string") &&
    BOOLEAN_FIELDS.every((f) => x[f] === undefined || typeof x[f] === "boolean")
  );
}

// Checks that a parsed backup or saved state looks like dashboard data, so a
// bad file never replaces good data.
function isValidState(s) {
  if (!s || typeof s !== "object" || s.version !== 1) return false;
  if (s.reviews !== undefined) {
    const r = s.reviews;
    if (!r || typeof r !== "object" || Array.isArray(r) || Object.values(r).some((v) => typeof v !== "string")) {
      return false;
    }
  }
  return ["tasks", "jobs", "contacts"].every((k) => {
    const list = s[k];
    return Array.isArray(list) && list.every(isValidRecord) && new Set(list.map((x) => x.id)).size === list.length;
  });
}

// Fills in optional top-level fields so the rest of the code can rely on them.
function normalizeState(s) {
  s.reviews = s.reviews || {};
  return s;
}

function isDone(task) {
  return task.status === TASK_STATUS.DONE;
}

function taskInWeek(task, week) {
  return task.week === week || (Array.isArray(task.rolledWeeks) && task.rolledWeeks.includes(week));
}

// Unfinished tasks never disappear: tasks from earlier weeks move to the
// current week (remembering where they came from in `rolledWeeks`), and
// unfinished "today" tasks carry over to the next day (remembering the first
// day in `todayFrom`). Returns the number of changes made.
function rollOver(state, todayStr = today()) {
  const week = mondayOf(todayStr);
  let changes = 0;
  for (const t of state.tasks) {
    if (!t || t.archived) continue;
    if (t.today && !t.todayAt) {
      t.todayAt = todayStr;
      changes++;
    }
    if (isDone(t)) continue;
    if (t.week && t.week < week) {
      t.rolledWeeks = Array.isArray(t.rolledWeeks) ? t.rolledWeeks : [];
      if (!t.rolledWeeks.includes(t.week)) t.rolledWeeks.push(t.week);
      t.week = week;
      changes++;
    }
    if (t.today && t.todayAt < todayStr) {
      t.todayFrom = t.todayFrom || t.todayAt;
      t.todayAt = todayStr;
      changes++;
    }
  }
  return changes;
}

// Everything that belongs on the calendar, sorted by date:
//   - "deadline": an application deadline for a job you have not applied to yet;
//   - "follow":   a follow-up date you set yourself on a job or contact.
function calendarItems(state) {
  const items = [];
  for (const j of state.jobs) {
    if (j.archived || OFF_CALENDAR_STATUSES.includes(j.status)) continue;
    if (j.deadline && !APPLIED_STATUSES.includes(j.status)) items.push({ type: "deadline", date: j.deadline, x: j, kind: "jobs" });
    if (j.due) items.push({ type: "follow", date: j.due, x: j, kind: "jobs" });
  }
  for (const c of state.contacts) {
    if (c.archived || c.status === CONTACT_STATUS.DONE || !c.due) continue;
    items.push({ type: "follow", date: c.due, x: c, kind: "contacts" });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.type === "deadline" ? -1 : 1));
}

// Application deadlines at most `days` away, including ones already missed.
function upcomingDeadlines(state, days = 14, todayStr = today()) {
  return calendarItems(state).filter((i) => i.type === "deadline" && dayDiff(i.date, todayStr) <= days);
}
