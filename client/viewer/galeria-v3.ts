/**
 * Galería del arte de almas v3 (prueba ciega del dueño). Un solo HTML autocontenido.
 * Uso: node client/viewer/galeria-v3.ts  → docs/arte/galeria-v3.html
 * Semillas fijas: siempre genera la misma galería.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import raw from "../../config/genetica.v0.2.json" with { type: "json" };
import { createRng, createWildCreature, parseGeneticsConfig, type Creature } from "../../packages/core/src/index.ts";
import { CORES, lookOf, MOODS, REMAINS, renderSoulLook, SOUL_CSS, TEMPERAMENT_LABEL, TEMPERAMENTS, TRAITS, type Mood, type SoulLook } from "../art/soul.ts";

const cfg = parseGeneticsConfig(raw);
const FAM_LABEL: Record<string, string> = { llama: "Llama", marea: "Marea", brote: "Brote", roca: "Roca", voltio: "Voltio", sombra: "Sombra" };
const PER_FAMILY = 4;

/** 4 almas por familia, elegidas entre 40 salvajes para que difieran en lo máximo posible. */
function pickFamily(fam: string): { c: Creature; look: SoulLook }[] {
  const rng = createRng(`galeria-v3|${fam}`);
  const cands = Array.from({ length: 60 }, (_, i) => {
    const c = createWildCreature(rng, cfg, { id: `${fam}-${i}`, family: fam });
    return { c, look: lookOf(c, cfg) };
  }).filter((x) => x.c.family === fam);
  const out: typeof cands = [];
  while (out.length < PER_FAMILY) {
    let best = cands[0] as (typeof cands)[0], bestScore = -1;
    for (const x of cands) {
      if (out.includes(x)) continue;
      let s = 0;
      for (const y of out) {
        s += (x.look.temperament !== y.look.temperament ? 4 : 0) + (x.look.variant !== y.look.variant ? 2 : 0) + (x.look.trait !== y.look.trait ? 2 : 0) + (x.look.core !== y.look.core ? 1 : 0) + (x.look.remains !== y.look.remains ? 1 : 0);
      }
      if (out.length > 0) s = s / out.length;
      if (out.every((y) => y.look.temperament !== x.look.temperament)) s += 3;
      if (s > bestScore) (best = x), (bestScore = s);
    }
    out.push(best);
  }
  return out;
}

const fams = cfg.baseFamilies;
const chosen = fams.map((fam) => ({ fam, souls: pickFamily(fam) }));

const desc = (l: SoulLook): string =>
  `${TEMPERAMENT_LABEL[l.temperament]} · silueta ${l.variant + 1} · núcleo ${CORES[l.core]} · ${TRAITS[l.trait]}${l.tier ? (l.tier === 2 ? " (llamativo)" : " (medio)") : ""} · ${REMAINS[l.remains]}`;

const card = (l: SoulLook, size: number, cap: string, mood: Mood = "idle"): string => `<figure>${renderSoulLook(l, { size, mood })}<figcaption class="lbl">${cap}</figcaption></figure>`;

const gridBig = chosen.map(({ fam, souls }) => `<div class="fam"><h3 class="lbl">${FAM_LABEL[fam]}</h3><div class="row">${souls.map((s) => card(s.look, 150, desc(s.look))).join("")}</div></div>`).join("");
const grid48 = chosen.map(({ fam, souls }) => `<div class="row small"><span class="lbl fl">${FAM_LABEL[fam]}</span>${souls.map((s) => renderSoulLook(s.look, { size: 48 })).join("")}</div>`).join("");

// prueba ciega: las 24 barajadas (orden fijo), numeradas, a 48 px; soluciones plegadas
const all = chosen.flatMap(({ fam, souls }) => souls.map((s) => ({ fam, look: s.look })));
const order = createRng("galeria-v3|ciega").shuffle(all.slice());
const blind = order.map((s, i) => `<figure class="b48">${renderSoulLook(s.look, { size: 48 })}<figcaption>${i + 1}</figcaption></figure>`).join("");
const answers = order.map((s, i) => `<li>${i + 1}: ${FAM_LABEL[s.fam]} · ${TEMPERAMENT_LABEL[s.look.temperament]}</li>`).join("");

// temperamentos: la misma alma con los 8 temperamentos
const base = (chosen.find((x) => x.fam === "marea")?.souls[0]?.look ?? (all[0] as { look: SoulLook }).look) as SoulLook;
const temper = (size: number): string => TEMPERAMENTS.map((t) => card({ ...base, temperament: t }, size, TEMPERAMENT_LABEL[t])).join("");
const temperMix = TEMPERAMENTS.map((t, i) => {
  const src = (chosen[i % chosen.length] as (typeof chosen)[0]).souls[1]?.look as SoulLook;
  return card({ ...src, temperament: t }, 110, `${TEMPERAMENT_LABEL[t]} · ${FAM_LABEL[src.silFamily]}`);
}).join("");

// reacciones en combate
const MOOD_LABEL: Record<Mood, string> = { idle: "En reposo", atk: "Ataca", hurt: "Recibe", low: "Poca vida", ko: "Cae" };
const reacts = [base, (chosen.find((x) => x.fam === "llama")?.souls[1]?.look ?? base) as SoulLook]
  .map((l) => `<div class="row">${MOODS.map((m) => card(l, 110, MOOD_LABEL[m], m)).join("")}</div>`)
  .join("");

// rasgos por gen de extremidades: discreto (común) y llamativo (rara)
const tsrc = (chosen.find((x) => x.fam === "sombra")?.souls[0]?.look ?? base) as SoulLook;
const traitRow = (tier: number): string => TRAITS.map((name, i) => card({ ...tsrc, trait: i, tier }, 100, name)).join("");

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proyecto Genoma · galería de almas v3</title><style>
body{font-family:system-ui,sans-serif;background:#0f0e16;color:#d9d6e6;margin:0;padding:14px;max-width:1100px}
h1{font-size:1.25rem;margin:.2em 0}h2{font-size:1.05rem;margin:1.6em 0 .5em;color:#fff}h3{font-size:.9rem;margin:.6em 0 .2em;color:#bbb}
p,li{font-size:.9rem;line-height:1.45;color:#aaa6bb}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
figure{margin:0;background:#17161f;border-radius:12px;padding:4px 4px 6px;text-align:center}
figcaption{font-size:.72rem;line-height:1.25;max-width:150px;color:#a9a5b9}
.small{background:#17161f;border-radius:10px;padding:6px;margin:4px 0;gap:6px;align-items:center}
.fl{display:inline-block;width:56px;font-size:.75rem}
.b48{padding:2px 2px 3px;border-radius:8px}.b48 figcaption{font-size:.7rem}
#lbl:not(:checked)~main .lbl{visibility:hidden}
label{font-size:.9rem;cursor:pointer}
details{margin-top:8px}summary{cursor:pointer;color:#ccc}
ol{columns:3;font-size:.8rem}
${SOUL_CSS}
</style></head><body>
<h1>Proyecto Genoma · galería de almas v3 (primera iteración)</h1>
<p>Almas dibujadas solo a partir de sus genes: la familia da la silueta; la cabeza, el temperamento (ojos, párpado, inclinación, vaivén); el cuerpo, el núcleo del pecho y las proporciones; las extremidades, un rasgo propio; la cola, los restos de debajo. Mismos genes → mismo dibujo.</p>
<input type="checkbox" id="lbl"><label for="lbl"> Mostrar etiquetas (desmarcado para la prueba ciega)</label>
<main>
<h2>1 · Cuatro almas salvajes por familia</h2>
${gridBig}
<h2>2 · La misma rejilla a 48 px</h2>
${grid48}
<h2>3 · Prueba ciega a 48 px</h2>
<p>Las 24 almas de arriba, barajadas. Para cada número, apunta familia y temperamento; luego compara con las soluciones.</p>
<div class="row">${blind}</div>
<details><summary>Soluciones</summary><ol style="list-style:none;padding:0">${answers}</ol></details>
<h2>4 · Temperamentos (gen de cabeza)</h2>
<p>La misma alma con los 8 temperamentos:</p>
<div class="row">${temper(110)}</div>
<div class="row small">${TEMPERAMENTS.map((t) => renderSoulLook({ ...base, temperament: t }, { size: 48 })).join("")}</div>
<p>Cada temperamento sobre otra familia:</p>
<div class="row">${temperMix}</div>
<h2>5 · Reacciones en combate (ojos)</h2>
${reacts}
<h2>6 · Rasgos por gen de extremidades</h2>
<p>Discreto (común):</p><div class="row">${traitRow(0)}</div>
<p>Llamativo (rara: calidad alta, mutación o híbrida):</p><div class="row">${traitRow(2)}</div>
</main>
</body></html>
`;

const out = new URL("../../docs/arte/galeria-v3.html", import.meta.url);
mkdirSync(new URL("./", out), { recursive: true });
writeFileSync(out, html);
console.log(`docs/arte/galeria-v3.html: ${(html.length / 1024).toFixed(0)} KB`);
