#!/usr/bin/env node
/**
 * @description Exécute un script npm et enregistre la sortie dans Perso/logs/ (bruit connu filtré).
 * Usage interne : node scripts/run-with-log.mjs android-build build:android:raw -- --apk
 */

import { spawn } from "node:child_process";
import {
  copyFileSync,
  createWriteStream,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldKeepLogLine } from "./log-noise-filter.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const logPrefix = process.argv[2];
const npmScript = process.argv[3];

if (!logPrefix || !npmScript) {
  console.error(
    "Usage : node scripts/run-with-log.mjs <prefixe-log> <script-npm> [-- args...]",
  );
  process.exit(1);
}

const dashIndex = process.argv.indexOf("--");
const npmArgs =
  dashIndex === -1 ? process.argv.slice(4) : process.argv.slice(dashIndex + 1);

const logDir = join(projectRoot, "Perso", "logs");
mkdirSync(logDir, { recursive: true });

const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .slice(0, 19)
  .replace("T", "-");
const logFile = join(logDir, `${logPrefix}-${timestamp}.txt`);
const logFileFull = join(logDir, `${logPrefix}-${timestamp}.full.txt`);
const latestLog = join(projectRoot, "Perso", "log.txt");

const argsSuffix =
  npmArgs.length > 0 ? ` -- ${npmArgs.join(" ")}` : "";

const header = [
  `=== Mangathèque — ${logPrefix} ===`,
  `Date     : ${new Date().toISOString()}`,
  `Script   : npm run ${npmScript}${argsSuffix}`,
  `CWD      : ${projectRoot}`,
  `CARGO_HOME       : ${process.env.CARGO_HOME ?? "(défaut)"}`,
  `RUSTUP_HOME      : ${process.env.RUSTUP_HOME ?? "(défaut)"}`,
  `GRADLE_USER_HOME : ${process.env.GRADLE_USER_HOME ?? "(défaut)"}`,
  `Note     : journal filtré (bruit connu masqué) — voir ${logFileFull} pour la sortie complète`,
  "",
].join("\n");

writeFileSync(logFile, header, "utf8");
writeFileSync(logFileFull, header.replace("filtré (bruit connu masqué) — voir", "complet — filtré dans"), "utf8");

const logStream = createWriteStream(logFile, { flags: "a" });
const logStreamFull = createWriteStream(logFileFull, { flags: "a" });

console.log("");
console.log("Journal enregistré dans :");
console.log(`  ${logFile} (filtré)`);
console.log(`  ${logFileFull} (complet)`);
console.log(`  ${latestLog} (copie filtrée la plus récente)`);
console.log("");

const npmArgsList = ["run", npmScript];
if (npmArgs.length > 0) {
  npmArgsList.push("--", ...npmArgs);
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const child = spawn(npmCmd, npmArgsList, {
  cwd: projectRoot,
  env: process.env,
  shell: false,
  stdio: ["inherit", "pipe", "pipe"],
});

let stdoutBuffer = "";
let stderrBuffer = "";

function flushBuffer(buffer, stream, isStderr) {
  const parts = buffer.split(/\r?\n/);
  const remainder = parts.pop() ?? "";

  for (const line of parts) {
    const payload = `${line}\n`;
    stream.write(payload);
    logStreamFull.write(payload);

    if (shouldKeepLogLine(line)) {
      if (isStderr) {
        process.stderr.write(payload);
      } else {
        process.stdout.write(payload);
      }
      logStream.write(payload);
    }
  }

  return remainder;
}

child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString();
  stdoutBuffer = flushBuffer(stdoutBuffer, process.stdout, false);
});

child.stderr.on("data", (chunk) => {
  stderrBuffer += chunk.toString();
  stderrBuffer = flushBuffer(stderrBuffer, process.stderr, true);
});

child.on("close", (code) => {
  if (stdoutBuffer) {
    flushBuffer(`${stdoutBuffer}\n`, process.stdout, false);
  }
  if (stderrBuffer) {
    flushBuffer(`${stderrBuffer}\n`, process.stderr, true);
  }

  const exitCode = code ?? 1;
  const footer = `\n=== Fin (code ${exitCode}) — ${new Date().toISOString()} ===\n`;
  logStream.write(footer);
  logStreamFull.write(footer);
  logStream.end();
  logStreamFull.end(() => {
    try {
      copyFileSync(logFile, latestLog);
    } catch {
      /* Perso/ peut être absent en CI */
    }
    process.exit(exitCode);
  });
});

child.on("error", (err) => {
  const message = `\nErreur d'exécution : ${err.message}\n`;
  process.stderr.write(message);
  logStream.write(message);
  logStreamFull.write(message);
  logStream.end();
  logStreamFull.end(() => process.exit(1));
});
