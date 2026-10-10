const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load");

const m = load("js/model.js", "js/inbox.js");

function inbox(overrides = {}) {
  return {
    version: 1,
    generated_by: "my-agent",
    jobs: [
      {
        opportunity_id: "acme/ml 1",
        employer: "Acme Robotics",
        title: "ML Engineer",
        url: "https://example.com/1",
        category: "fte",
        score_total: 82,
        scores: { interest: 22, capability: 21, attainability: 18, role_quality: 21 },
        ...overrides,
      },
    ],
  };
}

test("new jobs land in the review queue with a stable id", () => {
  const state = m.emptyState();
  const result = m.importInbox(state, inbox(), "2026-10-10");
  assert.deepEqual({ ...result }, { added: 1, updated: 0, withdrawn: 0 });
  const [job] = state.jobs;
  assert.equal(job.id, "scout-acme-ml-1");
  assert.equal(job.status, "To review");
  assert.equal(job.title, "Acme Robotics");
  assert.equal(job.detail, "ML Engineer");
  assert.equal(job.kind, "Full-time");
  assert.equal(job.priority, "High");
  assert.equal(job.importedAt, "2026-10-10");
  assert.equal(job.scout.total, 82);
  assert.equal(job.scout.engine, "my-agent", "engine names can be any string");
  assert.ok(m.isValidState(state));
});

test("importing again updates scout data but never your decisions", () => {
  const state = m.emptyState();
  m.importInbox(state, inbox());
  Object.assign(state.jobs[0], { status: "Preparing", note: "mine", deadline: "2026-11-01" });
  const result = m.importInbox(state, inbox({ score_total: 85, deadline: "2026-12-01" }));
  assert.deepEqual({ ...result }, { added: 0, updated: 1, withdrawn: 0 });
  assert.equal(state.jobs.length, 1);
  const [job] = state.jobs;
  assert.equal(job.status, "Preparing");
  assert.equal(job.note, "mine");
  assert.equal(job.deadline, "2026-11-01", "your own deadline is kept");
  assert.equal(job.scout.total, 85);
});

test("scores from several engines are kept side by side", () => {
  const state = m.emptyState();
  m.importInbox(state, inbox());
  m.importInbox(state, { ...inbox({ score_total: 74 }), generated_by: "Second Engine" });
  const { scout } = state.jobs[0];
  assert.deepEqual([...scout.source_engines], ["my-agent", "Second Engine"]);
  assert.equal(scout.engine_scores["my-agent"].total, 82);
  assert.equal(scout.engine_scores["Second Engine"].total, 74);
  assert.equal(m.sourceEngines({ engine: "  " }).length, 0);
});

test("revisions withdraw an earlier recommendation", () => {
  const state = m.emptyState();
  m.importInbox(state, inbox());
  const result = m.importInbox(state, {
    generated_by: "my-agent",
    jobs: [],
    revisions: [
      { opportunity_id: "acme/ml 1", disposition: "below", score_total: 61, review_reason: "Role now requires a PhD" },
      { opportunity_id: "unknown", disposition: "below" },
      { opportunity_id: "acme/ml 1", disposition: "something-else" },
    ],
  });
  assert.equal(result.withdrawn, 1);
  const { scout } = state.jobs[0];
  assert.equal(scout.review_disposition, "withdrawn");
  assert.equal(scout.review_outcome, "below");
  assert.equal(scout.review_previous_total, 82);
  assert.equal(scout.total, 61);
});

test("invalid entries are skipped", () => {
  const state = m.emptyState();
  const result = m.importInbox(state, { jobs: [{ employer: "No id" }, null, { opportunity_id: "x", employer: "E" }] });
  assert.equal(result.added, 0);
  assert.deepEqual({ ...m.importInbox(state, null) }, { added: 0, updated: 0, withdrawn: 0 });
});

test("categories map to job types", () => {
  assert.equal(m.jobKindFor("bridge"), "Bridge");
  assert.equal(m.jobKindFor("contract"), "Bridge");
  assert.equal(m.jobKindFor("internship"), "Internship");
  assert.equal(m.jobKindFor("long_term"), "Full-time");
  assert.equal(m.jobKindFor(undefined), "Full-time");
});

test("research notes attach to jobs by opportunity_id", () => {
  const state = m.emptyState();
  m.importInbox(state, inbox());
  const research = { items: { "acme/ml 1": { checked_at: "2026-10-09", team: "Six people" } } };
  assert.equal(m.importResearch(state, research), 1);
  assert.equal(state.jobs[0].scout.research.team, "Six people");
  assert.equal(m.importResearch(state, research), 0, "unchanged notes are not counted");
});

test("the example inbox in data/scout imports cleanly", () => {
  const file = path.resolve(__dirname, "../../data/scout/inbox.example.json");
  const state = m.emptyState();
  const result = m.importInbox(state, JSON.parse(fs.readFileSync(file, "utf8")));
  assert.ok(result.added >= 1);
  assert.ok(m.isValidState(state));
});
