import sharp from "sharp";
import { fileURLToPath } from "node:url";

const input = fileURLToPath(new URL("../public/prophrase-app-icon-1024.png", import.meta.url));
const output = fileURLToPath(new URL("../public/prophrase-logo-transparent.png", import.meta.url));
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const visited = new Uint8Array(info.width * info.height);
const queue = [];

function isBackground(offset) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  return red >= 205 && green >= 205 && blue >= 205 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 18;
}

function enqueue(x, y) {
  if (x < 0 || y < 0 || x >= info.width || y >= info.height) return;
  const pixel = y * info.width + x;
  if (visited[pixel]) return;
  const offset = pixel * 4;
  if (!isBackground(offset)) return;
  visited[pixel] = 1;
  queue.push(pixel);
}

for (let x = 0; x < info.width; x += 1) {
  enqueue(x, 0);
  enqueue(x, info.height - 1);
}
for (let y = 0; y < info.height; y += 1) {
  enqueue(0, y);
  enqueue(info.width - 1, y);
}

for (let cursor = 0; cursor < queue.length; cursor += 1) {
  const pixel = queue[cursor];
  const x = pixel % info.width;
  const y = Math.floor(pixel / info.width);
  data[pixel * 4 + 3] = 0;
  enqueue(x - 1, y);
  enqueue(x + 1, y);
  enqueue(x, y - 1);
  enqueue(x, y + 1);
}

await sharp(data, { raw: info }).png().toFile(output);
