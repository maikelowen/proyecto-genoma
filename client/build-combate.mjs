// Empaqueta client/combat en un único HTML autocontenido (sin dependencias nuevas).
// Transpila cada .ts con la API de `typescript` a CommonJS y los une con un mini cargador de módulos.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, relative } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(import.meta.url);
// --v05: misma interfaz con config/combate.v0.5.json, salida aparte (docs/jugable/combate-v05.html).
const V05 = process.argv.includes("--v05");

function loadTs() {
  const tries = ["typescript"];
  try { tries.push(resolve(execSync("npm root -g", { encoding: "utf8" }).trim(), "typescript")); } catch {}
  tries.push("/opt/npm-tools/node_modules/typescript");
  for (const t of tries) { try { return req(t); } catch {} }
  throw new Error("No se encuentra el paquete 'typescript' (npm install o instalación global).");
}
const ts = loadTs();

const modules = new Map(); // ruta absoluta -> código
function add(file) {
  if (modules.has(file)) return;
  if (file.endsWith(".json")) {
    modules.set(file, "module.exports = " + JSON.stringify(JSON.parse(readFileSync(file, "utf8"))) + ";");
    return;
  }
  let src = readFileSync(file, "utf8");
  // Desde D-064 data.ts ya usa v0.5; --v05 solo cambia la salida.
  const out = ts.transpileModule(src, {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, isolatedModules: true, sourceMap: false },
  });
  modules.set(file, out.outputText);
  for (const m of out.outputText.matchAll(/require\("(\.[^"]+)"\)/g)) add(resolve(dirname(file), m[1]));
}
const entry = resolve(root, "client/combat/main.ts");
add(entry);

const id = (f) => relative(root, f).replaceAll("\\", "/");
let js = '"use strict";\n(function(){\nvar defs={},cache={};\nfunction req(from,p){var k=resolve(from,p);if(cache[k])return cache[k].exports;var m=cache[k]={exports:{}};defs[k](m,m.exports,function(q){return req(k,q);});return m.exports;}\n' +
  'function resolve(from,p){var parts=from.split("/");parts.pop();p.split("/").forEach(function(s){if(s===".")return;if(s==="..")parts.pop();else parts.push(s);});return parts.join("/");}\n';
for (const [f, code] of modules) js += `defs[${JSON.stringify(id(f))}]=function(module,exports,require){\n${code}\n};\n`;
js += `req("x",${JSON.stringify("./" + id(entry))});\n})();\n`;
js = js.replace(/<\/script/gi, "<\\/script");

const css = readFileSync(resolve(root, "client/combat/style.css"), "utf8");
const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proyecto Genoma · Combate${V05 ? " (prueba v0.5)" : ""}</title>
<style>${css}</style></head>
<body><div id="app"></div>
<script>${js}</script></body></html>
`;
const out = resolve(root, V05 ? "client/out/combate-v05.html" : "client/out/combate.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
const pub = resolve(root, V05 ? "docs/jugable/combate-v05.html" : "docs/jugable/combate.html");
mkdirSync(dirname(pub), { recursive: true });
copyFileSync(out, pub);
console.log(`${V05 ? "combate-v05" : "combate"}.html: ${(html.length / 1024).toFixed(0)} KB, ${modules.size} módulos -> ${relative(root, out)} y ${relative(root, pub)}`);
