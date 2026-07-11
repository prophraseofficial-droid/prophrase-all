const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

process.env.EXPO_NO_METRO_WORKSPACE_ROOT =
  process.env.EXPO_NO_METRO_WORKSPACE_ROOT || "1";

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.projectRoot = projectRoot;
config.watchFolders = [];
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];
config.server = {
  ...config.server,
  unstable_serverRoot: projectRoot,
};

module.exports = config;
