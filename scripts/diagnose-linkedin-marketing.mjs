import fs from "node:fs";
import path from "node:path";

const workspace = process.cwd();
const inputPath = process.argv[2]
  ? path.resolve(workspace, process.argv[2])
  : path.join(workspace, "marketing/linkedin/metrics.csv");

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }

  values.push(value.trim());
  return values;
}

function loadRows(csv) {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(
    headers.map((header, index) => [header, parseCsvLine(line)[index] ?? ""]),
  ));
}

function number(value, label, postId) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} for ${postId} must be a non-negative number.`);
  }
  return parsed;
}

function percentage(numerator, denominator) {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(2)}%` : "n/a";
}

function currency(value) {
  return Number.isFinite(value) ? `₹${value.toFixed(2)}` : "n/a";
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Metrics file not found: ${inputPath}`);
}

const rows = loadRows(fs.readFileSync(inputPath, "utf8"))
  .map((row) => {
    const postId = row.post_id || "unknown-post";
    const metrics = Object.fromEntries([
      "impressions", "reactions", "comments", "reposts", "link_clicks",
      "signups", "activated_users", "paid_users", "spend_inr",
    ].map((key) => [key, number(row[key], key, postId)]));
    return { ...row, ...metrics };
  })
  .filter((row) => row.impressions > 0 || row.link_clicks > 0 || row.spend_inr > 0);

if (rows.length === 0) {
  console.log("No measured LinkedIn posts yet. Replace the example zeroes in marketing/linkedin/metrics.csv after publishing.");
  process.exit(0);
}

const analyzed = rows.map((row) => {
  const weightedEngagement = row.reactions + (row.comments * 3) + (row.reposts * 4);
  const engagementRate = row.impressions > 0 ? weightedEngagement / row.impressions : 0;
  const clickRate = row.impressions > 0 ? row.link_clicks / row.impressions : 0;
  const signupRate = row.link_clicks > 0 ? row.signups / row.link_clicks : 0;
  const activationRate = row.signups > 0 ? row.activated_users / row.signups : 0;
  const paidRate = row.signups > 0 ? row.paid_users / row.signups : 0;
  const costPerActivated = row.spend_inr > 0 && row.activated_users > 0
    ? row.spend_inr / row.activated_users
    : Number.NaN;
  const score = (engagementRate * 15) + (clickRate * 30) + (signupRate * 25)
    + (activationRate * 20) + (paidRate * 10);
  return { ...row, engagementRate, clickRate, signupRate, activationRate, paidRate, costPerActivated, score };
}).sort((left, right) => right.score - left.score);

const totals = analyzed.reduce((result, row) => {
  for (const key of [
    "impressions", "reactions", "comments", "reposts", "link_clicks",
    "signups", "activated_users", "paid_users", "spend_inr",
  ]) result[key] += row[key];
  return result;
}, {
  impressions: 0, reactions: 0, comments: 0, reposts: 0, link_clicks: 0,
  signups: 0, activated_users: 0, paid_users: 0, spend_inr: 0,
});

console.log("\nProPhrase LinkedIn marketing diagnosis\n");
console.log(`Measured posts: ${analyzed.length}`);
console.log(`Impressions: ${totals.impressions}`);
console.log(`Link CTR: ${percentage(totals.link_clicks, totals.impressions)}`);
console.log(`Click → signup: ${percentage(totals.signups, totals.link_clicks)}`);
console.log(`Signup → activated: ${percentage(totals.activated_users, totals.signups)}`);
console.log(`Signup → paid: ${percentage(totals.paid_users, totals.signups)}`);
console.log(`Spend: ${currency(totals.spend_inr)}`);
console.log(`Cost per activated user: ${totals.activated_users > 0 ? currency(totals.spend_inr / totals.activated_users) : "n/a"}`);

console.log("\nPost ranking\n");
for (const row of analyzed) {
  console.log(`${row.post_id} | ${row.theme} | CTR ${percentage(row.link_clicks, row.impressions)} | activation ${percentage(row.activated_users, row.signups)} | score ${row.score.toFixed(3)}`);
}

const best = analyzed[0];
console.log("\nDiagnosis\n");
if (totals.link_clicks === 0) {
  console.log("Posts are not producing site visits. Test a clearer first line, visible product transformation, and one direct CTA.");
} else if (totals.signups / totals.link_clicks < 0.08) {
  console.log("Clicks are not becoming signups. Align the landing-page example with the post and reduce signup friction before increasing reach.");
} else if (totals.activated_users / Math.max(totals.signups, 1) < 0.25) {
  console.log("Signups are not reaching value. Improve the first-run example and guide users to complete their first three rewrites.");
} else if (totals.paid_users / Math.max(totals.signups, 1) < 0.03) {
  console.log("Activation is working but conversion is weak. Test upgrade timing, annual-plan value, and limits shown after demonstrated value.");
} else {
  console.log("The funnel is healthy enough for controlled expansion. Repeat the winning theme and format before increasing posting frequency or spend.");
}
console.log(`Best current theme: ${best.theme} (${best.post_id}). Create the next variant around the same pain point with a different example.`);
