import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";

const root = process.cwd();
const failures = [];
const documents = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.name.endsWith(".md")) documents.push(path);
  }
}
for (const entry of readdirSync(root)) if (entry.endsWith(".md")) documents.push(resolve(root, entry));
collect(resolve(root, "docs"));
collect(resolve(root, ".github"));
const cache = new Map();
function content(path) {
  if (!cache.has(path)) cache.set(path, readFileSync(path, "utf8"));
  return cache.get(path);
}
function withoutCode(text) { return text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, ""); }
const anchorCache = new Map();
function anchors(path) {
  if (anchorCache.has(path)) return anchorCache.get(path);
  const found = new Set();
  const counts = new Map();
  const text = withoutCode(content(path));
  for (const match of text.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = match[1].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/<[^>]+>/g, "").toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, "").replaceAll(" ", "-");
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    found.add(count ? `${base}-${count}` : base);
  }
  for (const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) found.add(match[1]);
  anchorCache.set(path, found);
  return found;
}
const referencedImages = new Set();
let links = 0;
for (const document of documents) {
  const raw = content(document);
  const text = withoutCode(raw);
  const targets = [
    ...[...text.matchAll(/\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\s*\)/g)].map(match => match[1] ?? match[2]),
    ...[...text.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map(match => match[1]),
    ...[...text.matchAll(/^\[[^\]]+\]:\s*(\S+)/gm)].map(match => match[1]),
  ];
  for (const target of targets) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;
    links++;
    const [pathname, fragment] = target.split("#");
    const path = pathname ? resolve(dirname(document), decodeURIComponent(pathname.split("?")[0])) : document;
    const location = relative(root, document);
    if (path !== root && !path.startsWith(`${root}${sep}`)) { failures.push(`${location}: link escapes repository: ${target}`); continue; }
    if (!existsSync(path)) { failures.push(`${location}: missing target: ${target}`); continue; }
    if (extname(path) === ".png") referencedImages.add(path);
    if (fragment && path.endsWith(".md") && !anchors(path).has(decodeURIComponent(fragment))) failures.push(`${location}: missing heading: ${target}`);
  }
  const scripts = JSON.parse(content(resolve(root, "package.json"))).scripts;
  for (const match of raw.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) if (!scripts[match[1]]) failures.push(`${relative(root, document)}: unknown package script ${match[1]}`);
}

const imageDirectory = resolve(root, "docs/screenshots");
let imageBytes = 0;
const images = readdirSync(imageDirectory).filter(name => name.endsWith(".png"));
for (const name of images) {
  const path = resolve(imageDirectory, name);
  const bytes = readFileSync(path);
  imageBytes += bytes.length;
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.length < 24) failures.push(`${name}: invalid PNG header`);
  else if (!bytes.readUInt32BE(16) || !bytes.readUInt32BE(20)) failures.push(`${name}: empty image dimensions`);
  if (statSync(path).size > 3 * 1024 * 1024) failures.push(`${name}: exceeds the 3 MiB image budget`);
  if (!referencedImages.has(path)) failures.push(`${name}: not referenced by documentation`);
}
if (imageBytes > 12 * 1024 * 1024) failures.push("Gallery exceeds the 12 MiB total image budget.");
const pkg = JSON.parse(content(resolve(root, "package.json")));
const lock = JSON.parse(content(resolve(root, "package-lock.json")));
if (pkg.version !== lock.version || pkg.version !== lock.packages[""].version) failures.push("Package and lockfile versions do not agree.");

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else console.log(`Documentation checked: ${documents.length} Markdown files, ${links} local links, ${images.length} PNGs (${(imageBytes / 1024 / 1024).toFixed(2)} MiB).`);
