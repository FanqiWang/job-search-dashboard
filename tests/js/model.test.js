const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const m = load("js/model.js");

test("date helpers work in local YYYY-MM-DD strings", () => {
  assert.equal(m.mondayOf("2026-10-10"), "2026-10-05"); // Saturday -> Monday
  assert.equal(m.mondayOf("2026-10-05"), "2026-10-05");
  assert.equal(m.mondayOf("2026-10-11"), "2026-10-05"); // Sunday belongs to the week before
  assert.equal(m.addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(m.dayDiff("2026-10-15", "2026-10-10"), 5);
  assert.equal(m.dayDiff("2026-10-01", "2026-10-10"), -9);
  assert.equal(m.shiftMonth("2026-01", -1), "2025-12");
  assert.equal(m.shiftMonth("2026-11", 3), "2027-02");
});

test("isValidState accepts the empty state and rejects broken data", () => {
  assert.ok(m.isValidState(m.emptyState()));
  assert.ok(!m.isValidState(null));
  assert.ok(!m.isValidState({ ...m.emptyState(), version: 2 }));
  assert.ok(!m.isValidState({ ...m.emptyState(), jobs: "nope" }));
  assert.ok(!m.isValidState({ ...m.emptyState(), reviews: [] }));
  const dup = { id: "a", title: "x" };
  assert.ok(!m.isValidState({ ...m.emptyState(), tasks: [dup, dup] }));
  assert.ok(!m.isValidState({ ...m.emptyState(), tasks: [{ id: "has space", title: "x" }] }));
  assert.ok(!m.isValidState({ ...m.emptyState(), tasks: [{ id: "a", title: "x", archived: "yes" }] }));
  assert.ok(m.isValidState({ version: 1, tasks: [], jobs: [], contacts: [] }), "reviews is optional");
});

test("rollOver moves unfinished tasks to the current week and keeps the history", () => {
  const state = m.emptyState();
  state.tasks = [
    { id: "old", title: "Unfinished", status: "To do", week: "2026-09-28" },
    { id: "done", title: "Finished", status: "Done", week: "2026-09-28" },
    { id: "archived", title: "Archived", status: "To do", week: "2026-09-28", archived: true },
    { id: "today", title: "Yesterday's focus", status: "To do", week: "2026-10-05", today: true, todayAt: "2026-10-09" },
  ];
  const changes = m.rollOver(state, "2026-10-10");
  assert.equal(changes, 2);
  const [old, done, archived, focus] = state.tasks;
  assert.equal(old.week, "2026-10-05");
  assert.deepEqual([...old.rolledWeeks], ["2026-09-28"]);
  assert.equal(done.week, "2026-09-28");
  assert.equal(archived.week, "2026-09-28");
  assert.equal(focus.todayAt, "2026-10-10");
  assert.equal(focus.todayFrom, "2026-10-09");
  assert.equal(m.rollOver(state, "2026-10-10"), 0, "running it again changes nothing");
  assert.ok(m.taskInWeek(old, "2026-09-28") && m.taskInWeek(old, "2026-10-05"));
});

test("upcomingDeadlines skips applied, ended and archived jobs", () => {
  const state = m.emptyState();
  state.jobs = [
    { id: "soon", title: "A", status: "Preparing", deadline: "2026-10-15" },
    { id: "missed", title: "B", status: "Evaluating", deadline: "2026-10-01" },
    { id: "far", title: "C", status: "Evaluating", deadline: "2026-12-01" },
    { id: "applied", title: "D", status: "Applied", deadline: "2026-10-12" },
    { id: "passed", title: "E", status: "Passed", deadline: "2026-10-12" },
    { id: "archived", title: "F", status: "Preparing", deadline: "2026-10-12", archived: true },
  ];
  const ids = [...m.upcomingDeadlines(state, 14, "2026-10-10").map((i) => i.x.id)];
  assert.deepEqual(ids, ["missed", "soon"]);
});

test("simple mode hides the task and review pages only", () => {
  for (const v of ["overview", "jobs", "calendar", "contacts", "data"]) assert.ok(m.viewAllowed(v, "simple"), v);
  assert.ok(!m.viewAllowed("tasks", "simple"));
  assert.ok(!m.viewAllowed("review", "simple"));
  assert.ok(m.viewAllowed("tasks", "full"));
  assert.equal(m.modeFromQuery("?mode=simple"), "simple");
  assert.equal(m.modeFromQuery("?x=1&mode=full"), "full");
  assert.equal(m.modeFromQuery("?mode=other"), null);
  assert.equal(m.modeFromQuery(""), null);
});
