import sharp from "sharp";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../public/prophrase-logo-transparent.png", import.meta.url));
const outputDirectory = new URL("../extension/public/icons/", import.meta.url);

for (const size of [16, 32, 48, 96, 128]) {
  await sharp(source)
    .resize(size, size, { fit: "contain" })
    .png()
    .toFile(fileURLToPath(new URL(`icon-${size}.png`, outputDirectory)));
}

console.log("Synced transparent ProPhrase extension icons.");
