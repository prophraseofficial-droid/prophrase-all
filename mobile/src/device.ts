import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { Platform } from "react-native";

const deviceIdKey = "prophrase.mobile.device.id";

export async function getOrCreateDeviceId() {
  const existing = await SecureStore.getItemAsync(deviceIdKey);
  if (existing) return existing;

  const randomPart = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const nextId = `${Platform.OS}:${randomPart}`;
  await SecureStore.setItemAsync(deviceIdKey, nextId);
  return nextId;
}

export function getDeviceLabel() {
  const name = Constants.deviceName;
  if (name) return name;
  if (Platform.OS === "ios") return "iPhone";
  if (Platform.OS === "android") return "Android phone";
  return "Mobile device";
}
