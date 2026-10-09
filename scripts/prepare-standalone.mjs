import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const copyIntoStandalone = (source, target) => {
  if (!existsSync(source)) return;
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
};

copyIntoStandalone(".next/static", ".next/standalone/.next/static");
copyIntoStandalone("public", ".next/standalone/public");

// Next's file tracer can copy local dotenv files, including unrelated secrets.
// Standalone artifacts always receive credentials at runtime instead.
for (const name of readdirSync(".next/standalone")) {
  if (name === ".env" || name.startsWith(".env.")) rmSync(`.next/standalone/${name}`);
}
