// Checks that every JavaScript file parses and manifest.json is valid JSON.
//
// Usage: node tests/check-syntax.mjs

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import vm from "node:vm";

let failed = false;

function check(file, parse) {
  try {
    parse();
    console.log(`ok    ${file}`);
  } catch (error) {
    failed = true;
    console.log(`FAIL  ${file}\n${error.stderr?.toString() || error.stack}`);
  }
}

const filesIn = (folder, extension) =>
  fs.readdirSync(folder).filter(name => name.endsWith(extension)).map(name => `${folder}/${name}`);

// The browser loads these as classic scripts, not modules, so parse them that
// way: an "import" line here should fail.
for (const file of filesIn("src", ".js")) {
  check(file, () => new vm.Script(fs.readFileSync(file, "utf8"), { filename: file }));
}

for (const file of filesIn("tests", ".mjs")) {
  check(file, () => execFileSync(process.execPath, ["--check", file], { stdio: "pipe" }));
}

check("manifest.json", () => JSON.parse(fs.readFileSync("manifest.json", "utf8")));

process.exit(failed ? 1 : 0);
