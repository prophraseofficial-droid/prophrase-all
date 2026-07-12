import fs from "node:fs";
import path from "node:path";

const environment = {};
for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const raw = match[2];
    environment[match[1]] = raw.length >= 2 &&
      ((raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'")))
      ? raw.slice(1, -1)
      : raw;
  }
}

const files = [];
function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(entryPath);
    else files.push(entryPath);
  }
}
walk(".next/static");

const serverOnlyKeys = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
];
const leaked = serverOnlyKeys.filter((key) => {
  const value = environment[key];
  return value?.length >= 8 && files.some((file) =>
    fs.readFileSync(file).includes(Buffer.from(value)));
});

if (leaked.length) {
  console.error(`FAIL: server-only values found for ${leaked.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: no configured server-only secret values found in ${files.length} static bundle files`);
}
