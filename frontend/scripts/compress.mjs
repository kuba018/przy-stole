import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";
import sharp from "sharp";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
let before = 0;
let after = 0;

async function compressDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await compressDirectory(filename);
      continue;
    }
    if (/\.jpe?g$/i.test(entry.name)) {
      const source = await readFile(filename);
      const compressed = await sharp(source).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      const output = compressed.length < source.length ? compressed : source;
      await writeFile(filename, output);
      before += source.length;
      after += output.length;
    }
    if (/\.(html|js|css|svg|json|txt|xml)$/i.test(entry.name)) {
      const source = await readFile(filename);
      for (const [extension, compressed] of [
        ["br", brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })],
        ["gz", gzipSync(source, { level: 9 })],
      ]) {
        if (compressed.length < source.length) await writeFile(`${filename}.${extension}`, compressed);
      }
    }
  }
}

await compressDirectory(dist);
console.log(`JPEG bytes: ${before} -> ${after}`);
