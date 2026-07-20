import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import path from "node:path";

function findLanAddress() {
  const interfaces = networkInterfaces();
  const preferredNames = ["en0", "en1"];

  for (const name of preferredNames) {
    const match = interfaces[name]?.find(
      (entry) => entry.family === "IPv4" && !entry.internal,
    );
    if (match) return match.address;
  }

  for (const entries of Object.values(interfaces)) {
    const match = entries?.find(
      (entry) => entry.family === "IPv4" && !entry.internal,
    );
    if (match) return match.address;
  }

  throw new Error(
    "No LAN address was found. Connect the Mac and iPhone to the same Wi-Fi network.",
  );
}

const lanAddress = findLanAddress();
const metroPort = process.env.PROPHRASE_METRO_PORT ?? "8081";
const apiBaseUrl =
  process.env.PROPHRASE_DEVICE_API_BASE_URL ?? `http://${lanAddress}:3000`;
const authRedirectUrl = `exp://${lanAddress}:${metroPort}/--/auth/callback`;
const expoBinary = path.join(process.cwd(), "node_modules", ".bin", "expo");

console.log(`\nProPhrase physical-device testing`);
console.log(`API: ${apiBaseUrl}`);
console.log(`OAuth callback: ${authRedirectUrl}`);
console.log("Add that OAuth callback to Supabase Redirect URLs before signing in.\n");

const child = spawn(
  expoBinary,
  ["start", "--go", "--lan", "--port", metroPort, ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: "--dns-result-order=ipv4first",
      REACT_NATIVE_PACKAGER_HOSTNAME: lanAddress,
      EXPO_PUBLIC_API_BASE_URL: apiBaseUrl,
      EXPO_PUBLIC_WEB_BASE_URL: apiBaseUrl,
      EXPO_PUBLIC_AUTH_REDIRECT_URL: authRedirectUrl,
      EXPO_OFFLINE: "1",
      EXPO_NO_TELEMETRY: "1",
      EXPO_NO_REDIRECT_PAGE: "1",
      EXPO_NO_METRO_WORKSPACE_ROOT: "1",
    },
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
