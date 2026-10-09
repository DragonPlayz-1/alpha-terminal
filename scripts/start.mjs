import "dotenv/config";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const runtime = resolve(process.env.STANDALONE_DIR ?? ".next/standalone");
const server = spawn(process.execPath, [resolve(runtime, "server.js")], {
  cwd: runtime,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", HOSTNAME: process.env.LISTEN_HOST ?? "0.0.0.0" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.kill(signal));
server.once("error", error => { console.error(error.message); process.exitCode = 1; });
server.once("exit", code => { process.exitCode = code ?? 0; });
