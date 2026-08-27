import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const nextCli = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const workerScript = fileURLToPath(
  new URL("./pipeline-worker.mjs", import.meta.url),
);
const mode = process.argv[2];
const rawArgs = process.argv.slice(3);
const dryRun = rawArgs.includes("--dry-run");
const nextArgs = rawArgs.filter((arg) => arg !== "--dry-run");

if (mode !== "dev" && mode !== "start") {
  console.error("Usage: node scripts/run-with-worker.mjs <dev|start>");
  process.exit(1);
}

function configuredPort(args) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (
      (argument === "--port" || argument === "-p") &&
      args[index + 1]
    ) {
      return args[index + 1];
    }
    if (argument.startsWith("--port=")) {
      return argument.slice("--port=".length);
    }
  }
  return process.env.PORT || "3000";
}

const appBaseUrl =
  process.env.APP_BASE_URL ??
  `http://127.0.0.1:${configuredPort(nextArgs)}`;
const nextCommand = [process.execPath, nextCli, mode, ...nextArgs];
const workerCommand = [process.execPath, workerScript];

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        nextCommand,
        workerCommand,
        appBaseUrl,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const children = [
  spawn(nextCommand[0], nextCommand.slice(1), {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  }),
  spawn(workerCommand[0], workerCommand.slice(1), {
    cwd: rootDir,
    env: {
      ...process.env,
      APP_BASE_URL: appBaseUrl,
    },
    stdio: "inherit",
  }),
];

let stopping = false;
let exitCode = 0;
let exitedChildren = 0;

function stopChildren(signal, code) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      child.kill(signal);
    }
  }
}

for (const child of children) {
  child.on("error", (error) => {
    console.error("[runtime] child process failed", error);
    stopChildren("SIGTERM", 1);
  });
  child.on("exit", (code, signal) => {
    exitedChildren += 1;
    if (!stopping) {
      const resolvedCode = code ?? (signal ? 1 : 0);
      console.error(
        `[runtime] child exited (${signal ?? resolvedCode}); stopping runtime`,
      );
      stopChildren("SIGTERM", resolvedCode);
    }
    if (exitedChildren === children.length) {
      process.exit(exitCode);
    }
  });
}

process.on("SIGINT", () => stopChildren("SIGINT", 0));
process.on("SIGTERM", () => stopChildren("SIGTERM", 0));
