/**
 * Galería del arte de almas v3 (prueba ciega del dueño). Un solo HTML autocontenido.
 * Uso: node client/viewer/galeria-v3.ts  → docs/arte/galeria-v3.html
 * Semillas fijas: siempre genera la misma galería.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import raw from "../../config/genetica.v0.2.json" with { type: "json" };
import { breed, createRng, createWildCreature, parseGeneticsConfig, type Creature, type LocusId } from "../../packages/core/src/index.ts";
import { ACCESSORIES, ACCESSORY_LABEL, CORES, lookOf, MOODS, MOUTH_LABEL, MOUTHS, REMAINS, renderSoulLook, SILHOUETTES, SOUL_CSS, TEMPERAMENT_LABEL, TEMPERAMENTS, TRAITS, type Accessory, type Mood, type SoulLook } from "../art/soul.ts";

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
        s += (x.look.temperament !== y.look.temperament ? 4 : 0) + (x.look.mouth !== y.look.mouth ? 1 : 0) + (x.look.silFamily === fam ? 1 : 0) + (x.look.variant !== y.look.variant ? 2 : 0) + (x.look.trait !== y.look.trait ? 2 : 0) + (x.look.core !== y.look.core ? 1 : 0) + (x.look.remains !== y.look.remains ? 1 : 0);
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

const mouthName = (l: SoulLook): string => (l.mouth ? MOUTH_LABEL[l.mouth].toLowerCase() : "sin boca");
const desc = (l: SoulLook): string =>
  `${TEMPERAMENT_LABEL[l.temperament]}, ${mouthName(l)} · silueta ${SILHOUETTES[l.silFamily][l.variant]} · núcleo ${CORES[l.core]} · ${TRAITS[l.trait]}${l.tier ? (l.tier === 2 ? " (rara)" : " (media)") : ""} · ${REMAINS[l.remains]}`;

const card = (l: SoulLook, size: number, cap: string, mood: Mood = "idle", accessory?: Accessory): string =>
  `<figure>${renderSoulLook(l, accessory ? { size, mood, accessory } : { size, mood })}<figcaption class="lbl">${cap}</figcaption></figure>`;

const gridBig = chosen.map(({ fam, souls }) => `<div class="fam"><h3 class="lbl">${FAM_LABEL[fam]}</h3><div class="row">${souls.map((s) => card(s.look, 150, desc(s.look))).join("")}</div></div>`).join("");
const grid48 = chosen.map(({ fam, souls }) => `<div class="row small"><span class="lbl fl">${FAM_LABEL[fam]}</span>${souls.map((s) => renderSoulLook(s.look, { size: 48 })).join("")}</div>`).join("");

// prueba ciega: las 24 barajadas (orden fijo), numeradas, a 48 px; soluciones plegadas
const all = chosen.flatMap(({ fam, souls }) => souls.map((s) => ({ fam, look: s.look })));
const order = createRng("galeria-v3|ciega").shuffle(all.slice());
const blind = order.map((s, i) => `<figure class="b48">${renderSoulLook(s.look, { size: 48 })}<figcaption>${i + 1}</figcaption></figure>`).join("");
const answers = order.map((s, i) => `<li>${i + 1}: ${FAM_LABEL[s.fam]} · ${TEMPERAMENT_LABEL[s.look.temperament]}</li>`).join("");

// caras: los 18 genes de cabeza (temperamento + boca) sobre la misma ánima
const famLook = (fam: string): SoulLook => ((chosen.find((x) => x.fam === fam)?.souls.find((s) => s.look.silFamily === fam) ?? chosen.find((x) => x.fam === fam)?.souls[0])?.look ?? (all[0] as { look: SoulLook }).look) as SoulLook;
const base = famLook("marea");
const HEADS: [string, SoulLook["temperament"], SoulLook["mouth"]][] = [];
for (const fam of fams) {
  for (let v = 1; v <= 3; v++) {
    const c = createWildCreature(createRng(`cabezas|${fam}|${v}`), cfg, { id: `h-${fam}-${v}`, family: fam });
    const g = { ...c.genome, cabeza: { ...c.genome.cabeza, D: { ...c.genome.cabeza.D, id: `${fam}.cabeza.${v}`, family: fam } } };
    const l = lookOf({ ...c, genome: g }, cfg);
    HEADS.push([`${FAM_LABEL[fam]} ${v}`, l.temperament, l.mouth]);
  }
}
const heads = (size: number, cap: boolean): string =>
  HEADS.map(([n, t, m]) => (cap ? card({ ...base, temperament: t, mouth: m }, size, `${TEMPERAMENT_LABEL[t]}, ${m ? MOUTH_LABEL[m].toLowerCase() : "sin boca"} <small>(${n})</small>`) : renderSoulLook({ ...base, temperament: t, mouth: m }, { size }))).join("");
const confusables = (["altivo", "aburrido", "sereno"] as const).map((t) => {
  const h = HEADS.filter((x) => x[1] === t);
  return h.map(([n, tt, m]) => card({ ...base, temperament: tt, mouth: m }, 48, `${TEMPERAMENT_LABEL[tt]} (${n})`)).join("");
}).join("");

// reacciones en combate
const MOOD_LABEL: Record<Mood, string> = { idle: "En reposo", atk: "Ataca", hurt: "Recibe", low: "Poca vida", ko: "Cae" };
const reacts = [base, famLook("llama")]
  .map((l) => `<div class="row">${MOODS.map((m) => card(l, 110, MOOD_LABEL[m], m)).join("")}</div>`)
  .join("");

// rasgos por gen de extremidades: común, media y rara (mismo tamaño)
const tsrc = famLook("sombra");
const traitRow = (tier: number): string => TRAITS.map((name, i) => card({ ...tsrc, trait: i, tier }, 100, name)).join("");

// siluetas por gen de cuerpo; Llama y Sombra en gris
const silRow = (fam: keyof typeof SILHOUETTES, src: SoulLook): string =>
  SILHOUETTES[fam].map((n, v) => card({ ...src, silFamily: fam, variant: v }, 100, `${FAM_LABEL[fam]} · ${n}`)).join("");
const sils = fams.map((fam) => `<div class="row">${silRow(fam as keyof typeof SILHOUETTES, famLook(fam))}</div>`).join("");
const greyRow = (fam: "llama" | "sombra"): string => SILHOUETTES[fam].map((_, v) => renderSoulLook({ ...famLook(fam), silFamily: fam, variant: v }, { size: 90 })).join("") + SILHOUETTES[fam].map((_, v) => renderSoulLook({ ...famLook(fam), silFamily: fam, variant: v }, { size: 48 })).join("");

// bocas (gen de cabeza)
const msrc = famLook("brote");
const mouthsBig = MOUTHS.map((m) => card({ ...msrc, mouth: m }, 100, MOUTH_LABEL[m])).join("") + card({ ...msrc, mouth: null }, 100, "Sin boca");
const mouths48 = [...MOUTHS, null].map((m) => renderSoulLook({ ...msrc, mouth: m }, { size: 48 })).join("");
const mouthsOther = MOUTHS.map((m, i) => {
  const src = (chosen[i % chosen.length] as (typeof chosen)[0]).souls[2]?.look as SoulLook;
  return renderSoulLook({ ...src, mouth: m }, { size: 48 });
}).join("");

// complementos de muestra: la misma ánima sin y con cada uno
const accSrc = [famLook("voltio"), famLook("roca")];
const accRows = accSrc
  .map((l) => `<div class="row">${card(l, 110, "Sin complemento")}${ACCESSORIES.map((a) => card(l, 110, ACCESSORY_LABEL[a], "idle", a)).join("")}</div><div class="row small">${renderSoulLook(l, { size: 48 })}${ACCESSORIES.map((a) => renderSoulLook(l, { size: 48, accessory: a })).join("")}</div>`)
  .join("");

// prueba de herencia: cría real con breed() y semillas fijas; cada zona viene de un progenitor
const ZONE: Record<LocusId, string> = { cabeza: "Cara y boca (cabeza)", cuerpo: "Silueta y núcleo (cuerpo)", extremidades: "Rasgo (extremidades)", cola: "Lo de debajo (cola)" };
const LOCI: LocusId[] = ["cabeza", "cuerpo", "extremidades", "cola"];
const PAIRS: [string, string][] = [["llama", "llama"], ["marea", "sombra"], ["roca", "voltio"], ["brote", "brote"], ["sombra", "llama"], ["voltio", "marea"], ["roca", "brote"]];
function differs(a: SoulLook, b: SoulLook, L: LocusId): boolean {
  if (L === "cabeza") return a.temperament !== b.temperament && a.mouth !== b.mouth;
  if (L === "cuerpo") return (a.silFamily !== b.silFamily || a.variant !== b.variant) && a.core !== b.core;
  if (L === "extremidades") return a.trait !== b.trait;
  return a.remains !== b.remains && a.tailVariant !== b.tailVariant;
}
const trios = PAIRS.map(([fa, fb], pi) => {
  for (let i = 0; i < 4000; i++) {
    const p1 = createWildCreature(createRng(`herencia|${pi}|${i}|p`), cfg, { id: `padre-${pi}`, family: fa });
    const p2 = createWildCreature(createRng(`herencia|${pi}|${i}|m`), cfg, { id: `madre-${pi}`, family: fb });
    const l1 = lookOf(p1, cfg), l2 = lookOf(p2, cfg);
    if (!LOCI.every((L) => differs(l1, l2, L))) continue;
    const r = breed(p1, p2, createRng(`herencia|${pi}|${i}|cria`), cfg, { id: `cria-${pi}`, birth: 1 });
    if (r.trace.some((t) => t.mutated || (t.dSlot !== 0 && t.dSlot !== 3))) continue;
    if (r.child.family !== p1.family && r.child.family !== p2.family) continue;
    // A = el de id menor ("madre-" < "padre-"): slot 0 = madre, 3 = padre
    const from = r.trace.map((t) => (t.dSlot === 0 ? "madre" : "padre"));
    const nP = from.filter((x) => x === "padre").length;
    if (nP !== 2) continue;
    return { p1, p2, child: r.child, from, seed: i };
  }
  throw new Error(`sin trío para ${fa}×${fb}`);
}).slice(0, 7);
const trioHtml = trios
  .map((t, n) => {
    const lp = lookOf(t.p1, cfg), lm = lookOf(t.p2, cfg), lc = lookOf(t.child, cfg);
    const fig = (l: SoulLook, cap: string): string => `<figure>${renderSoulLook(l, { size: 140 })}${renderSoulLook(l, { size: 48 })}<figcaption>${cap}</figcaption></figure>`;
    return `<div class="trio"><span class="tn">${n + 1}</span>${fig(lp, `Padre · ${FAM_LABEL[t.p1.family] ?? t.p1.family}`)}<span class="op">+</span>${fig(lm, `Madre · ${FAM_LABEL[t.p2.family] ?? t.p2.family}`)}<span class="op">→</span>${fig(lc, `Cría · ${FAM_LABEL[t.child.family] ?? t.child.family}`)}</div>`;
  })
  .join("");
const trioAns = trios.map((t, n) => `<li><b>${n + 1}.</b> ${LOCI.map((L, i) => `${ZONE[L]}: <b>${t.from[i]}</b>`).join(" · ")}</li>`).join("");

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proyecto Genoma · galería de ánimas v3</title><style>
body{font-family:system-ui,sans-serif;background:#0f0e16;color:#d9d6e6;margin:0;padding:14px;max-width:1100px}
h1{font-size:1.25rem;margin:.2em 0}h2{font-size:1.05rem;margin:1.6em 0 .5em;color:#fff}h3{font-size:.9rem;margin:.6em 0 .2em;color:#bbb}
p,li{font-size:.9rem;line-height:1.45;color:#aaa6bb}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
figure{margin:0;background:#17161f;border-radius:12px;padding:4px 4px 6px;text-align:center}
figcaption{font-size:.72rem;line-height:1.25;max-width:150px;color:#a9a5b9}
.small{background:#17161f;border-radius:10px;padding:6px;margin:4px 0;gap:6px;align-items:center}
.fl{display:inline-block;width:56px;font-size:.75rem}
.b48{padding:2px 2px 3px;border-radius:8px}.b48 figcaption{font-size:.7rem}
.grey{filter:grayscale(1)}
.trio{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:10px 0;padding:6px;background:#13121a;border-radius:12px}
.trio figure svg+svg{display:block;margin:2px auto 0}
.trio .op{font-size:1.6rem;color:#777}.trio .tn{font-weight:700;color:#fff;width:22px}
#lbl:not(:checked)~main .lbl{visibility:hidden}
label{font-size:.9rem;cursor:pointer}
details{margin-top:8px}summary{cursor:pointer;color:#ccc}
ol{columns:3;font-size:.8rem}
${SOUL_CSS}
</style></head><body>
<h1>Proyecto Genoma · galería de ánimas v3 (segunda iteración)</h1>
<p>Ánimas dibujadas solo a partir de sus genes. <b>Un gen = una zona fija:</b> la <b>cabeza</b> da la cara (ojos, párpado, boca); el <b>cuerpo</b>, la silueta, la proporción y el núcleo del pecho; las <b>extremidades</b>, el rasgo (en tono claro de la familia del gen); la <b>cola</b>, lo de debajo (cola y restos, con el color de la familia del gen). El color del cuerpo y de los ojos es el de la familia del ánima. Mismos genes → mismo dibujo.</p>
<input type="checkbox" id="lbl"><label for="lbl"> Mostrar etiquetas (desmarcado para las pruebas ciegas)</label>
<main>
<h2>1 · Prueba de herencia</h2>
<p>Crías reales generadas con la función de cría del núcleo (semillas fijas). Para cada trío, di de quién viene cada zona: <b>cara y boca</b>, <b>silueta y núcleo</b>, <b>rasgo</b> y <b>lo de debajo</b>. Cada ánima sale en grande y a 48 px.</p>
${trioHtml}
<details><summary>Solución</summary><ul>${trioAns}</ul></details>
<h2>2 · Cuatro ánimas salvajes por familia</h2>
${gridBig}
<h2>3 · La misma rejilla a 48 px</h2>
${grid48}
<h2>4 · Prueba ciega a 48 px</h2>
<p>Las 24 ánimas de arriba, barajadas. Para cada número, apunta familia y temperamento; luego compara con las soluciones.</p>
<div class="row">${blind}</div>
<details><summary>Soluciones</summary><ol style="list-style:none;padding:0">${answers}</ol></details>
<h2>5 · Caras: los 18 genes de cabeza</h2>
<p>La misma ánima con cada gen de cabeza (temperamento y boca; un tercio sin boca). Los ojos miden casi lo mismo salvo en el desquiciado.</p>
<div class="row">${heads(100, true)}</div>
<div class="row small">${heads(48, false)}</div>
<p>Altivo, aburrido y sereno a 48 px (antes se confundían):</p>
<div class="row">${confusables}</div>
<h2>6 · Bocas</h2>
<p>Las 8 bocas y sin boca, sobre la misma ánima:</p>
<div class="row">${mouthsBig}</div>
<div class="row small">${mouths48}</div>
<p>Sobre otras familias, a 48 px:</p>
<div class="row small">${mouthsOther}</div>
<h2>7 · Siluetas (gen de cuerpo)</h2>
<div>${sils}</div>
<p>Llama (arriba) y Sombra (abajo) en gris: se distinguen por la silueta.</p>
<div class="row small grey">${greyRow("llama")}</div>
<div class="row small grey">${greyRow("sombra")}</div>
<h2>8 · Rasgos (gen de extremidades)</h2>
<p>Común:</p><div class="row">${traitRow(0)}</div>
<p>Media (detalle):</p><div class="row">${traitRow(1)}</div>
<p>Rara (detalle, brillo y segunda pieza; mismo tamaño):</p><div class="row">${traitRow(2)}</div>
<h2>9 · Reacciones en combate (ojos)</h2>
${reacts}
<h2>10 · Complementos de muestra</h2>
<p>No salen de los genes ni están en el combate: serán objetos equipables más adelante. La misma ánima sin y con cada uno.</p>
${accRows}
</main>
</body></html>
`;

const out = new URL("../../docs/arte/galeria-v3.html", import.meta.url);
mkdirSync(new URL("./", out), { recursive: true });
writeFileSync(out, html);
console.log(`docs/arte/galeria-v3.html: ${(html.length / 1024).toFixed(0)} KB`);
