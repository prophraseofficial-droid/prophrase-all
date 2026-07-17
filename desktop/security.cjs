const externalProtocols = new Set(["https:", "mailto:"]);

function getSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    if (
      !externalProtocols.has(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

module.exports = { getSafeExternalUrl };
