/**
 * Avance de estilo: 12 salvajes (2 por familia base), 1 mutada, 1 híbrida
 * y una fila a 48 px. Semillas fijas. Uso: node client/viewer/avance.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import raw from "../../config/genetica.v0.2.json" with { type: "json" };
import { breed, createRng, createWildCreature, parseGeneticsConfig, type Creature, type GeneticsConfig } from "../../packages/core/src/index.ts";
import { expressionOf, renderCreatureSvg } from "../art/render.ts";

const cfg = parseGeneticsConfig(raw);
const hiRaw = structuredClone(raw) as typeof raw;
hiRaw.mutacion.prob_por_locus = 0.5;
const hiCfg = parseGeneticsConfig(hiRaw);

const wild: Creature[] = [];
for (const fam of cfg.baseFamilies) {
  const rng = createRng(`avance-${fam}`);
  for (let i = 0; i < 2; i++) wild.push(createWildCreature(rng, cfg, { id: `${fam}-${i}`, family: fam, pure: true }));
}

function findBred(gcfg: GeneticsConfig, seed: string, a: string, b: string, ok: (c: Creature) => boolean): Creature | null {
  const rng = createRng(seed);
  for (let i = 0; i < 300; i++) {
    const p1 = createWildCreature(rng, gcfg, { id: `p${i}a`, family: a, pure: true });
    const p2 = createWildCreature(rng, gcfg, { id: `p${i}b`, family: b, pure: true });
    const r = breed(p1, p2, rng, gcfg, { id: `c${i}`, birth: 1 });
    if (ok(r.child)) return r.child;
  }
  return null;
}
const mutant = findBred(hiCfg, "avance-mut", "brote", "sombra", (c) => Object.values(c.genome).some((l) => l.D.origin === "mutacion"));
const hybrid = findBred(hiCfg, "avance-hib", "llama", "marea", (c) => cfg.hybridById.has(c.family));

const label = (c: Creature, extra = "") => {
  const ds = Object.entries(c.genome).map(([k, l]) => `${k[0]}:${l.D.family}${l.D.origin === "mutacion" ? "*" : ""}`).join(" ");
  return `<b>${c.family}</b>${extra} · ${expressionOf(c)}<br><small>${ds}</small>`;
};
const card = (c: Creature, extra = "") => `<figure>${renderCreatureSvg(c, cfg, { size: 160 })}<figcaption>${label(c, extra)}</figcaption></figure>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proyecto Genoma · avance de estilo</title><style>
body{font-family:system-ui,sans-serif;background:#f6f3ec;color:#2b2a33;margin:0;padding:12px}
h1{font-size:1.2rem}h2{font-size:1rem;margin-top:1.4em}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
figure{margin:0;background:#fff;border-radius:12px;padding:6px;text-align:center;box-shadow:0 1px 3px #0001}
figure svg{width:100%;height:auto}figcaption{font-size:.8rem;line-height:1.3}small{color:#777}
.row{display:flex;flex-wrap:wrap;gap:4px;background:#fff;border-radius:12px;padding:8px}
</style></head><body>
<h1>Proyecto Genoma · avance de estilo (arte procedural desde genes)</h1>
<p>Leyenda: c/cu/e/co = familia del gen D de cabeza, cuerpo, extremidades y cola; <b>*</b> = gen mutado.</p>
<h2>Familias base (2 salvajes puras de cada una)</h2><div class="grid">${wild.map((c) => card(c)).join("")}</div>
<h2>Mutada e híbrida (cría con mutación forzada al 50 % por locus)</h2><div class="grid">
${mutant ? card(mutant, " · mutada") : "<p>No salió mutada.</p>"}${hybrid ? card(hybrid, " · híbrida") : "<p>No salió híbrida.</p>"}</div>
<h2>Las 12 a 48 px (siluetas en móvil)</h2><div class="row">${wild.map((c) => renderCreatureSvg(c, cfg, { size: 48, idPrefix: `s${c.id}` })).join("")}</div>
</body></html>`;

mkdirSync(new URL("../out/", import.meta.url), { recursive: true });
writeFileSync(new URL("../out/avance-estilo.html", import.meta.url), html);
console.log("client/out/avance-estilo.html", html.length, "bytes", mutant ? "mutada ok" : "sin mutada", hybrid ? `híbrida ${hybrid.family}` : "sin híbrida");
