// Runs the mock YouTube tests in a real browser. No packages to install.
//
// Usage: node tests/run.mjs chrome     (or firefox)
//        node tests/run.mjs --serve    then open the address in any browser
//
// Set BROWSER_PATH if the browser isn't on your PATH under its usual name.
//
// The test page sends its results back to this script, which prints them and
// exits with 1 if anything failed.

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TIMEOUT_MS = 60000;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  "/": ["tests/mock/youtube.html", "text/html; charset=utf-8"],
  "/src/content.js": ["src/content.js", "text/javascript; charset=utf-8"],
  "/src/styles.css": ["src/styles.css", "text/css; charset=utf-8"],
};

const mode = process.argv[2];
if (!["chrome", "firefox", "--serve"].includes(mode)) {
  console.error("Usage: node tests/run.mjs chrome|firefox|--serve");
  process.exit(2);
}

let browser = null;
let profile = null;

function finish(code) {
  browser?.kill("SIGKILL");
  try {
    if (profile) fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    // A leftover temporary folder isn't worth failing the tests over.
  }
  process.exit(code);
}

const server = http.createServer((request, response) => {
  const { pathname } = new URL(request.url, "http://localhost");

  if (request.method === "POST" && pathname === "/result") {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      response.end();
      const { passed, total, lines } = JSON.parse(body);
      console.log(`${lines.join("\n")}\n\n${passed}/${total} passed`);
      if (mode !== "--serve") finish(total > 0 && passed === total ? 0 : 1);
    });
    return;
  }

  if (!Object.hasOwn(FILES, pathname)) {
    response.writeHead(404).end();
    return;
  }
  const [file, type] = FILES[pathname];
  response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  response.end(fs.readFileSync(path.join(root, file)));
});

const port = mode === "--serve" ? Number(process.env.PORT ?? 8791) : 0;
const host = process.env.HOST ?? "127.0.0.1";

server.listen(port, host, () => {
  const url = `http://${host}:${server.address().port}/`;
  if (mode === "--serve") {
    console.log(`Open ${url}`);
    return;
  }

  profile = fs.mkdtempSync(path.join(os.tmpdir(), "bwl-test-"));
  const [command, args] = mode === "chrome"
    ? ["google-chrome", ["--headless=new", `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1280,900", url]]
    : ["firefox", ["--headless", "--no-remote", "--profile", profile, "--window-size=1280,900", url]];

  browser = spawn(process.env.BROWSER_PATH ?? command, args, { stdio: "ignore" });
  browser.on("error", error => {
    console.error(`Couldn't start ${mode}: ${error.message}`);
    finish(1);
  });

  setTimeout(() => {
    console.error(`No results from ${mode} after ${TIMEOUT_MS / 1000} seconds.`);
    finish(1);
  }, TIMEOUT_MS);
});
