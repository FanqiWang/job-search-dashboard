// Regenerates the README screenshots in docs/images/ from the demo data.
//
//   npm install           # once; installs Playwright (a dev-only dependency)
//   npx playwright install chromium
//   npm run screenshots
//
// The clock is frozen so the pictures do not change from run to run.

const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs/images");
const APP = "file://" + path.join(ROOT, "app/index.html").replace(/\\/g, "/");
const NOW = new Date("2026-10-14T10:00:00");

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => {
    throw e;
  });
  await page.clock.setFixedTime(NOW);
  await page.goto(APP);

  const shot = async (name, options = {}) => {
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, name + ".png"), ...options });
    console.log("saved docs/images/" + name + ".png");
  };
  const show = (view) => page.click(`nav button[data-view="${view}"]`);
  const scrollTo = (selector) => page.locator(selector).evaluate((el) => el.scrollIntoView({ block: "start" }));

  await shot("overview");

  await show("jobs");
  await scrollTo("#reviewQueue");
  await page.mouse.wheel(0, -16);
  await shot("review-queue");

  await page.locator("details.stage-panel").first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await shot("jobs-by-stage");

  await page.click('button[data-edit="jobs:scout-demo-tidewater-features"]');
  await shot("job-details");
  await page.click("#close");

  await show("tasks");
  await shot("weekly-lists");

  await show("calendar");
  await scrollTo(".cal-head");
  await page.mouse.wheel(0, -40);
  await shot("calendar");

  await show("review");
  await page.fill("#week", "2026-10-05");
  await page.dispatchEvent("#week", "change");
  await shot("weekly-review");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
