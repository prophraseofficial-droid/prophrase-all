import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser, mode }) => ({
    name: "ProPhrase AI",
    short_name: "ProPhrase AI",
    description: "Rephrase selected text and copy content across your ProPhrase devices.",
    permissions: ["activeTab", "contextMenus", "identity", "scripting", "storage"],
    host_permissions: [
      "https://prophrase.in/*",
      ...(mode === "development" ? ["http://localhost:3000/*"] : []),
    ],
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      96: "icons/icon-96.png",
      128: "icons/icon-128.png",
    },
    action: {
      default_title: "Open ProPhrase",
      default_icon: {
        16: "icons/icon-16.png",
        32: "icons/icon-32.png",
      },
    },
    web_accessible_resources: [
      {
        resources: ["icons/icon-48.png"],
        matches: ["http://*/*", "https://*/*"],
      },
    ],
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "extension@prophrase.in",
              strict_min_version: "140.0",
              data_collection_permissions: {
                required: ["authenticationInfo", "personalCommunications", "websiteContent"],
              },
            },
          },
        }
      : {}),
  }),
});
