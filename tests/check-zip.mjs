// Checks a built extension zip: everything manifest.json points to is inside,
// and nothing that shouldn't ship is.
//
// Usage: node tests/check-zip.mjs better-watch-later.zip

import fs from "node:fs";

// Reads the file names from the zip's central directory.
function zipFileNames(zip) {
  const end = zip.lastIndexOf(Buffer.from("PK\x05\x06"));
  if (end < 0) throw new Error("not a zip file");

  const names = [];
  let offset = zip.readUInt32LE(end + 16);
  for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
    const nameLength = zip.readUInt16LE(offset + 28);
    names.push(zip.toString("utf8", offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  return names.filter(name => !name.endsWith("/"));
}

const names = zipFileNames(fs.readFileSync(process.argv[2]));
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

const needed = [
  "manifest.json",
  "LICENSE.md",
  ...Object.values(manifest.icons ?? {}),
  ...manifest.content_scripts.flatMap(script => [...(script.js ?? []), ...(script.css ?? [])]),
];

const missing = [...new Set(needed)].filter(name => !names.includes(name));
const unwanted = names.filter(name => !/^(manifest\.json|LICENSE\.md|(src|icons)\/.+)$/.test(name));

console.log(names.join("\n"));
if (missing.length) console.log(`FAIL  missing from the zip: ${missing.join(", ")}`);
if (unwanted.length) console.log(`FAIL  shouldn't be in the zip: ${unwanted.join(", ")}`);
if (missing.length || unwanted.length) process.exit(1);
console.log(`ok    ${names.length} files, nothing missing or extra`);
