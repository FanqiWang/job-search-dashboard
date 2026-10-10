const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const m = load("js/model.js", "seed.js");

test("demo data is valid, flagged as demo, and covers the workflow", () => {
  const demo = m.buildDemoState("2026-10-10");
  assert.ok(m.isValidState(demo));
  assert.equal(demo.demo, true);
  assert.ok(demo.jobs.length >= 10 && demo.jobs.length <= 14);
  assert.equal(demo.contacts.length, 6);
  assert.equal(Object.keys(demo.reviews).length, 1);
  const statuses = new Set(demo.jobs.map((j) => j.status));
  for (const s of m.JOB_STATUSES.filter((s) => s !== "Hired")) assert.ok(statuses.has(s), `has a job in "${s}"`);
  for (const j of demo.jobs) assert.ok(m.JOB_KINDS.includes(j.kind), j.kind);
  assert.ok(demo.tasks.every((t) => m.taskInWeek(t, "2026-10-05")), "tasks belong to the current week");
});

test("demo data only links to reserved example domains", () => {
  const text = JSON.stringify(m.buildDemoState("2026-10-10"));
  for (const url of text.match(/https?:\/\/[^"\s]+/g)) assert.match(url, /^https:\/\/example\.(com|org|net)\//);
  assert.doesNotMatch(text, /@/, "no email addresses");
});

test("demo dates follow today", () => {
  const a = m.buildDemoState("2026-10-10");
  const b = m.buildDemoState("2027-03-03");
  const deadline = (s) => s.jobs.find((j) => j.status === "Preparing").deadline;
  assert.equal(m.dayDiff(deadline(a), "2026-10-10"), m.dayDiff(deadline(b), "2027-03-03"));
});
