const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const m = load("js/model.js", "js/matching.js");

const jobs = [
  { id: "acme-ml", title: "Acme Robotics", detail: "Machine Learning Engineer, Data Platform", status: "Preparing" },
  { id: "acme-be", title: "Acme Robotics", detail: "Backend Engineer, Fleet Telemetry", status: "To review" },
  { id: "lumen", title: "Lumen Freight (LMF)", detail: "ML Platform Engineer", status: "Evaluating" },
  { id: "gone", title: "Granite Ledger", detail: "Research Scientist", status: "Passed" },
];

test("search needs every term to match", () => {
  const job = { title: "Acme Robotics", detail: "ML Engineer", note: "Ask about on-call", scout: { location: "Seattle" } };
  assert.ok(m.matchesQuery(job, m.searchTerms("acme seattle")));
  assert.ok(m.matchesQuery(job, m.searchTerms("  ON-CALL ")));
  assert.ok(!m.matchesQuery(job, m.searchTerms("acme boston")));
  assert.ok(m.matchesQuery(job, m.searchTerms("")));
});

test("tasks about applications link to the company's best-matching role", () => {
  const linked = m.linkedJobs({ title: "Apply to Acme Robotics data platform role" }, jobs);
  assert.equal(linked.mode, "auto");
  assert.deepEqual([...linked.jobs.map((j) => j.id)], ["acme-ml"]);
});

test("abbreviations in parentheses identify a company", () => {
  const linked = m.linkedJobs({ title: "Interview prep for LMF" }, jobs);
  assert.deepEqual([...linked.jobs.map((j) => j.id)], ["lumen"]);
});

test("tasks that are not about applying, or ended jobs, are not linked", () => {
  assert.deepEqual([...m.linkedJobs({ title: "Read about Acme Robotics" }, jobs).jobs], []);
  assert.deepEqual([...m.linkedJobs({ title: "Apply to Granite Ledger" }, jobs).jobs], []);
  assert.deepEqual([...m.linkedJobs({ title: "Apply to acmerobotics.example" }, jobs).jobs], [], "whole words only");
});

test("manual links win, and 'none' turns linking off", () => {
  const manual = m.linkedJobs({ title: "Apply to Acme Robotics", jobIds: "lumen" }, jobs);
  assert.equal(manual.mode, "manual");
  assert.deepEqual([...manual.jobs.map((j) => j.id)], ["lumen"]);
  const off = m.linkedJobs({ title: "Apply to Acme Robotics", jobIds: "none" }, jobs);
  assert.equal(off.mode, "off");
  assert.equal(off.jobs.length, 0);
});

test("short job names add the role only when a company appears twice", () => {
  assert.equal(m.jobShortName(jobs[2], [jobs[2]]), "LMF");
  assert.equal(m.jobShortName(jobs[0], jobs.slice(0, 2)), "Acme Robotics · Machine Learning Engin");
});
