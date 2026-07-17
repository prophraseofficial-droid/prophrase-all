import { browser } from "wxt/browser";

const DEVICE_ID_KEY = "prophrase_extension_device_id";

export async function getDeviceId() {
  const stored = await browser.storage.local.get(DEVICE_ID_KEY);
  if (typeof stored[DEVICE_ID_KEY] === "string") {
    return stored[DEVICE_ID_KEY] as string;
  }

  const deviceId = `extension:${crypto.randomUUID()}`;
  await browser.storage.local.set({ [DEVICE_ID_KEY]: deviceId });
  return deviceId;
}
