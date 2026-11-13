/** Interfaz del combate jugable (DOM sin dependencias). Estados: team → plan ⇄ report. */
import { attackable, describeMove, describeMoveShort, eligibleActors, forecastTargets, freeMoveSlot, restingMoves, validatePlacement, type Action, type BattleEvent, type BattleState, type Move, type SideId } from "../../packages/core/src/index.ts";
import { cfg, familyLabel, gcfg, palette } from "./data.ts";
import { SOUL_ART } from "./souls.ts";
import { chooseOpponentAi, newSeed, playTurn, rollOffer, rollRival, startFight, type Dificultad, type Fight, type Soul } from "./game.ts";
import { key, narrate, type LogLine, type Part } from "./narrate.ts";
import { paintEnergy, paintUnit, playTurn as playAnim, viewFrom, type Field, type Player, type UnitEls } from "./anim.ts";

// ------------------------------------------------------------------ utilidades DOM
type Attrs = Record<string, string | number | boolean | EventListener | undefined> | null;
type Kid = Node | string | null | false | undefined;
function h(tag: string, attrs: Attrs, ...kids: Kid[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c !== null && c !== false && c !== undefined) el.append(c);
  return el;
}
const svgNS = "http://www.w3.org/2000/svg";

// ------------------------------------------------------------------ marcador (localStorage con respaldo en memoria)
const LS_KEY = "genoma.combate.v1";
let score = { played: 0, won: 0 };
try {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    const o = JSON.parse(raw) as { played?: unknown; won?: unknown };
    if (typeof o.played === "number" && typeof o.won === "number") score = { played: o.played, won: o.won };
  }
} catch {
  /* sin almacenamiento: solo en memoria */
}
function saveScore(): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(score));
  } catch {
    /* solo en memoria */
  }
}

// ------------------------------------------------------------------ estado de la aplicación
type Phase = "team" | "place" | "plan" | "report";
interface Pick {
  move: number;
}
const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
let offerSeed = params.get("oferta") ?? newSeed();
let pendingFightSeed: string | null = params.get("combate");
let offer: Soul[] = rollOffer(offerSeed);
let picked: number[] = []; // índices de la oferta, en orden de elección (3)
let slots: (number | null)[] = [0, 1, 2, null]; // casilla 1–4 → alma del equipo (0–2) o vacía
let selSoul: number | null = null;
let phase: Phase = "team";
let fight: Fight | null = null;
let picks: Pick[] = [];
let report: { lines: LogLine[]; before: BattleState; events: readonly BattleEvent[] } | null = null;
let player: Player | null = null;
let difficulty: Dificultad = "normal";
const LS_SPEED = "genoma.combate.vel.v1";
let speed: 1 | 2 = 1;
try {
  if (localStorage.getItem(LS_SPEED) === "2") speed = 2;
} catch {
  /* sin almacenamiento */
}
function saveSpeed(): void {
  try {
    localStorage.setItem(LS_SPEED, String(speed));
  } catch {
    /* solo en memoria */
  }
}
let hint = "";
let pendingResult: BattleState["result"] = null;
let focus = 1;
const app = document.getElementById("app") as HTMLElement;

const SIDE: Record<SideId, 0 | 1> = { A: 0, B: 1 };
const alive = (s: BattleState, side: SideId): boolean[] => s.fighters[SIDE[side]].map((f) => !f.ko);
const rowName = (pos: number): string => (cfg.combat.frontRow.includes(pos) ? "Delantera" : "Trasera");

// ------------------------------------------------------------------ componentes visuales
/** Icono del alma: silueta y cara estáticas de la familia (híbridas: la del primer componente con halo del segundo). */
function soulShape(family: string, size: number, ko = false): SVGElement {
  const hy = gcfg.hybridById.get(family);
  const art = SOUL_ART[hy ? hy.components[0] : family] ?? (SOUL_ART["sombra"] as { viewBox: string; svg: string });
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", art.viewBox);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "soul" + (ko ? " dead" : ""));
  if (hy) svg.setAttribute("style", `filter:drop-shadow(0 0 3px ${palette(hy.components[1]).main}) drop-shadow(0 0 2px ${palette(hy.components[1]).main})`);
  svg.innerHTML = art.svg; // constante estática de souls.ts, nunca datos del usuario
  return svg;
}

function partNode(p: Part): Node {
  if (typeof p === "string") return document.createTextNode(p);
  return h("b", { class: p.s === "A" ? "na" : "nb" }, p.s === "A" ? p.n : `${p.n} (rival)`);
}

function energyBar(have: number, spent: number): HTMLElement {
  const cells: HTMLElement[] = [];
  for (let i = 0; i < cfg.combat.energy.max; i++) cells.push(h("span", { class: "cell " + (i < have - spent ? "full" : i < have ? "spent" : "") }));
  return h("div", { class: "energy" }, h("span", { class: "lbl" }, "Energía"), h("span", { class: "cells" }, ...cells), h("span", { class: "num" }, spent > 0 ? `${have - spent}/${have}` : `${have}`));
}

/** Posiciones (% del escenario, centro del icono) por bando y posición. Rival arriba a la derecha, tuyo abajo a la izquierda; la trasera, más lejos y más pequeña. */
const SPOT: Record<SideId, [number, number][]> = {
  // El rival se dibuja en espejo (no girado 180°): cada carril queda enfrente del mismo carril propio,
  // así el objetivo automático por carril (spec combate v0.4 §3) ataca al alma que se ve delante.
  B: [[70, 46], [46, 36], [86, 23], [64, 15]],
  A: [[54, 64], [30, 54], [36, 85], [14, 77]],
};
/** Runas abstractas propias (no son un alfabeto real) en un anillo elíptico; brillan con el color de cada bando. */
const RUNES = ["M0,-6V6M-4,-2L0,-6L4,-2", "M-5,5Q0,-8 5,5M0,-1V5", "M-4,-6V6M4,-6V6M-4,0H4M-4,-6L4,2", "M-5,0A5,5 0 1 0 5,0A5,5 0 1 0 -5,0M0,-8V8", "M-5,-5L0,5L5,-5M-3,0H3", "M0,-6L5,0L0,6L-5,0ZM0,-2V2"];
function plat(cls: string): HTMLElement {
  const el = h("div", { class: "plat " + cls });
  let g = "";
  for (let i = 0; i < 10; i++) {
    const a = ((i + (cls === "pf" ? 0.3 : 0)) / 10) * Math.PI * 2;
    g += `<path transform="translate(${(Math.cos(a) * 76).toFixed(1)} ${(Math.sin(a) * 30).toFixed(1)}) scale(.8 1.1)" stroke-width="1.6" d="${RUNES[(i * 5 + (cls === "pf" ? 2 : 0)) % RUNES.length]}"/>`;
  }
  el.innerHTML = `<svg viewBox="-100 -50 200 100" preserveAspectRatio="none" aria-hidden="true"><ellipse rx="92" ry="40" stroke-width="1.5"/><ellipse rx="58" ry="22" stroke-width="1" stroke-dasharray="3 5"/>${g}</svg>`;
  return el;
}


interface Sel {
  actor: number | null;
  tgts: { side: SideId; pos: number }[];
  onPick?: (side: SideId, pos: number) => void;
  /** Almas propias con un movimiento de pago asignado (posición → coste y nombre). */
  orders?: Record<number, { txt: string; title: string }>;
  /** Rival: casillas atacables ahora y las que provocan. */
  atk?: readonly number[];
  taunt?: readonly number[];
  /** Previsión de objetivos de cada orden (líneas finas). */
  lines?: { from: number; side: SideId; to: readonly number[]; focus: boolean; pay: boolean }[];
}

/** Escena de batalla: almas flotando sobre plataformas, sin cartas. Devuelve los elementos para animarlos.
 *  El nombre y la vida de cada alma van en una capa propia (`.iw`) por encima de todos los iconos: así una delantera no tapa la trasera.
 *  Las casillas vacías no pintan nada. */
function buildField(f: Fight, st: BattleState, sel?: Sel): Field {
  const units = new Map<string, UnitEls>();
  const energy = { A: h("span", { class: "en" }), B: h("span", { class: "en" }) } as Record<SideId, HTMLElement>;
  const layer: HTMLElement[] = [];
  const unit = (side: SideId, pos: number): HTMLElement | null => {
    const i = SIDE[side];
    const soul = (i === 0 ? f.mine : f.rival)[pos - 1];
    if (!soul) return null;
    const c = soul.combatant;
    const [x, y] = SPOT[side][pos - 1] as [number, number];
    const front = cfg.combat.frontRow.includes(pos);
    const ico = h("div", { class: "ico" }, soulShape(c.family, 100));
    const bar = h("i", null);
    const hp = h("div", { class: "hpn" });
    const chips = h("div", { class: "chips" });
    const o = side === "A" ? sel?.orders?.[pos] : undefined;
    const base = [side === "A" ? "mine" : "foe", front ? "front" : "back"];
    if (side === "B" && sel?.atk?.includes(pos)) base.push("atk");
    const vars = `--fam:${palette(c.family).main};--x:${x}%;--y:${y}%`;
    const iw = h("div", { class: "iw " + base.join(" "), style: vars }, h("div", { class: "info" }, h("div", { class: "uname" }, soul.name), h("div", { class: "bar" }, bar), chips, hp, side === "B" && sel?.taunt?.includes(pos) ? h("span", { class: "tau" }, "Provoca") : null), o ? h("span", { class: "ord", title: o.title }, o.txt) : null);
    const cls = ["unit", ...base];
    if (sel && side === "A" && sel.actor === pos) cls.push("sel-actor");
    if (sel && sel.tgts.some((t) => t.side === side && t.pos === pos)) cls.push(side === "A" ? "sel-ally" : "sel-foe");
    const el = h("div", { class: cls.join(" "), style: `${vars};--d:${-(pos * 0.7 + i * 0.35).toFixed(2)}s;z-index:${Math.round(y / 5)}`, title: soul.name }, h("div", { class: "shadow" }), h("div", { class: "selring" }), ico);
    el.addEventListener("mouseenter", () => iw.classList.add("hov"));
    el.addEventListener("mouseleave", () => iw.classList.remove("hov"));
    el.addEventListener("click", () => {
      iw.classList.toggle("peek");
      sel?.onPick?.(side, pos);
    });
    const u: UnitEls = { unit: el, ico, bar, hp, chips, maxHp: c.maxHp, family: c.family, iw };
    units.set(key(side, pos), u);
    paintUnit(u, viewFrom(st, side, pos), false);
    layer.push(iw);
    return el;
  };
  paintEnergy(energy.A, st.energy[0]);
  paintEnergy(energy.B, st.energy[1]); // fuera de la escena: la energía del rival no se muestra
  const all: HTMLElement[] = [];
  for (const side of ["B", "A"] as SideId[]) for (let p = 1; p <= 4; p++) {
    const u = unit(side, p);
    if (u) all.push(u);
  }
  // previsión de objetivos: líneas finas (la del alma elegida, más marcada) y un punto en cada destino
  const fx: HTMLElement[] = [];
  if (sel?.lines?.length) {
    let svg = "";
    for (const l of sel.lines) {
      const [x1, y1] = SPOT.A[l.from - 1] as [number, number];
      for (const t of l.to) {
        if (l.side === "A" && t === l.from) continue;
        const [x2, y2] = SPOT[l.side][t - 1] as [number, number];
        svg += `<line class="l${l.focus ? " f" : ""}${l.pay ? " p" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
        fx.push(h("i", { class: "dot" + (l.focus ? " f" : "") + (l.pay ? " p" : ""), style: `left:${x2}%;top:${y2}%` }));
      }
    }
    const box = h("div", { class: "fx" });
    box.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${svg}</svg>`;
    fx.unshift(box);
  }
  const tag1 = sel?.atk ? h("div", { class: "tag t1" }, "Atacable: " + (sel.atk.map((p) => (f.rival[p - 1] as Soul).name).join(", ") || "—")) : null;
  const el = h("div", { class: "stage" }, h("div", { class: "bg" }, h("div", { class: "stars" }), h("div", { class: "floor" })), plat("pf"), plat("pm"), tag1, h("div", { class: "tag t2" }, "Tú · ", energy.A), ...fx, ...all, ...layer);
  return { el, units, energy };
}

const GLOSARIO: [string, string][] = [
  ["Gratis", "No gasta energía ni descansa; todas las almas tienen uno."],
  ["Descansa", "No se puede usar el turno siguiente al usarlo."],
  ["a la fila", "Afecta a todas las almas de una fila (la delantera enemiga, o la tuya expuesta si es de apoyo)."],
  ["atrás", "Salta la fila delantera y golpea a la trasera (si no hay nadie detrás, a la delantera)."],
  ["Provoca", "Este turno, todos los ataques enemigos a un solo objetivo van a esta alma."],
  ["Escudo", "Absorbe daño antes que la vida durante 2 turnos."],
  ["Cura", "Recupera vida al aliado más herido."],
  ["Drena", "Recupera el 30 % del daño hecho."],
  ["Quema", "Pierde 12 de vida por pila al final de cada turno (3 turnos, hasta 3 pilas)."],
  ["Aturde", "Pierde su próxima acción."],
  ["Marca", "Recibe un 20 % más de daño."],
  ["Debilita", "Hace un 20 % menos de daño."],
  ["Ralentiza / Prisa", "Actúa más tarde / antes."],
  ["Regenera", "Recupera 15 de vida al final de cada turno durante 3 turnos."],
  ["Primero", "Actúa antes que los movimientos normales."],
  ["Perfora", "Ignora el escudo."],
  ["+1 energía", "Devuelve 1 de energía al bando."],
  ["×1,5 en combo", "Otra alma de su familia usa un movimiento de pago este turno."],
  ["×1,5 si está afectado", "El objetivo tiene un estado negativo."],
  ["×1,5 si herido", "El usuario está por debajo del 50 % de vida."],
  ["×1,5 si va antes", "El objetivo aún no ha actuado."],
  ["×1,5 con reserva", "Quedan 3 o más de energía tras pagar."],
];

const E = cfg.combat.energy;
const HELP: [string, string][] = [
  ["Energía", `Todo tu bando comparte una reserva: ${E.initial} al empezar y +${E.perTurn} cada turno (máximo ${E.max}). Cada alma tiene un movimiento gratis y tres de pago (coste 1–5). Lo que no gastas se guarda.`],
  ["Turnos simultáneos", "Tú y el rival elegís a la vez, sin ver el plan del otro. Cada alma viva actúa una vez por turno (si no está aturdida); todas empiezan con su movimiento gratis. Desde el turno 11 el daño sube un 25 % por turno; en el 20 sin ganador hay empate."],
  ["Filas y colocación", "La cuadrícula es de 2×2: fila delantera y trasera, y dos carriles. Tus 3 almas ocupan 3 casillas y una queda vacía (2 delante + 1 detrás, o 1 delante + 2 detrás). La delantera recibe los ataques mientras quede alguien vivo en ella; la trasera solo recibe los «atrás» hasta que caiga. El rival coloca a ciegas."],
  ["Objetivo automático", "No eliges objetivo: se decide al actuar. Cada atacante prefiere el alma de su carril en la fila atacable; Provoca desvía los ataques de un solo objetivo. Las líneas finas del campo muestran a quién iría cada orden ahora."],
  ["Descanso", "Un movimiento de pago que usas descansa el turno siguiente. El gratis nunca descansa."],
  ["Iniciativa", "Decide quién actúa antes dentro del turno (con algo de azar). Prisa suma y ralentizar resta. Curación, protección y «primero» actúan antes."],
  ["Familias", "Anillo base: Marea > Llama > Brote > Roca > Voltio > Sombra > Marea (cada una gana a la siguiente: x1,25, y pierde contra la anterior: x0,8). Las híbridas tienen su propio anillo: Vapor > Magma > Espora > Liquen > Plasma > Tormenta > Abismo > Vapor."],
  ["Sinergia", "Si 2 o 3 de tus almas usan movimientos de pago de la misma familia en el mismo turno, esos movimientos ganan +10 % o +25 % de potencia. El gratis no cuenta."],
];

function glossaryNodes(): HTMLElement[] {
  return [h("p", null, h("b", null, "Glosario")), h("dl", { class: "glos" }, ...GLOSARIO.flatMap(([w, d]) => [h("dt", null, w), h("dd", null, d)]))];
}

function helpBox(): HTMLElement {
  return h("details", { class: "help" }, h("summary", null, "Ayuda: cómo se juega"), ...HELP.map(([t, x]) => h("p", null, h("b", null, t + ". "), x)), ...glossaryNodes());
}

function topBar(): HTMLElement {
  return h("div", { class: "top" }, h("h1", null, "Proyecto Genoma · Combate"), h("div", { class: "score", id: "score" }, `Partidas: ${score.played} · Ganadas: ${score.won}`));
}

// ------------------------------------------------------------------ pantalla de equipo
function toggleSoul(i: number): void {
  const k = picked.indexOf(i);
  hint = "";
  if (k >= 0) picked.splice(k, 1);
  else if (picked.length < 3) picked.push(i);
  else hint = "Ya tienes 3 almas: quita una antes de elegir otra.";
  render();
}
function randomTeam(): void {
  const idxs = offer.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j] as number, idxs[i] as number];
  }
  picked = idxs.slice(0, 3);
  hint = "";
  render();
}
function newOffer(): void {
  offerSeed = newSeed();
  offer = rollOffer(offerSeed);
  picked = [];
  hint = "";
  render();
}

/** Movimientos de un combatiente con el gratis primero. */
function orderedMoves(c: Soul["combatant"]): { m: Move; slot: number }[] {
  const fs = freeMoveSlot(c);
  const all = c.moves.map((m, k) => ({ m, slot: k + 1 }));
  return [...all.filter((x) => x.slot === fs), ...all.filter((x) => x.slot !== fs)];
}

function soulCard(i: number): HTMLElement {
  const s = offer[i] as Soul;
  const c = s.combatant;
  const k = picked.indexOf(i);
  const pal = palette(c.family);
  const moves = orderedMoves(c).map(({ m }) => h("li", null, h("b", null, m.name), h("span", { class: "cost" }, m.cost === 0 ? " gratis" : ` ${m.cost}⚡`), h("div", { class: "mdesc" }, describeMoveShort(m, cfg.moves))));
  return h(
    "div",
    { class: `scard${k >= 0 ? " picked" : ""}`, style: `--fam:${pal.main}`, role: "button", tabindex: 0, onclick: () => toggleSoul(i), onkeydown: ((e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggleSoul(i))) as EventListener },
    h("div", { class: "fhead" }, soulShape(c.family, 64), h("div", { class: "fname" }, h("b", null, s.name), h("small", null, familyLabel(c.family))), k >= 0 ? h("span", { class: "pk" }, String(k + 1)) : null),
    h("div", { class: "stats" }, h("span", null, `Vida ${c.maxHp}`), h("span", null, `Ataque ${c.attack.toFixed(2)}`), h("span", null, `Iniciativa ${Math.round(c.initiative)}`)),
    h("ul", { class: "moves" }, ...moves),
  );
}

function goPlace(): void {
  slots = [0, 1, 2, null]; // por defecto: 2 delante + 1 detrás
  selSoul = null;
  phase = "place";
  render();
}

function renderTeam(): void {
  const ready = picked.length === 3;
  const name = (i: number): string => (offer[i] as Soul).name;
  app.replaceChildren(
    topBar(),
    h("p", { class: "intro" }, "Elige 3 almas entre las 8 ofrecidas. Después las colocarás en la cuadrícula."),
    helpBox(),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "btn", onclick: () => randomTeam() }, "Equipo aleatorio"),
      h("button", { class: "btn", onclick: () => newOffer() }, "Nuevas almas"),
      h("button", { class: "btn primary", disabled: !ready, onclick: () => ready && goPlace() }, "Colocar equipo"),
    ),
    h("div", { class: "diff" }, h("span", { class: "lbl" }, "Dificultad del rival"), h("button", { class: "btn" + (difficulty === "normal" ? " on" : ""), onclick: () => ((difficulty = "normal"), render()) }, "Normal"), h("button", { class: "btn" + (difficulty === "dificil" ? " on" : ""), onclick: () => ((difficulty = "dificil"), render()) }, "Difícil")),
    h("p", { class: "sel" }, `Equipo (${picked.length}/3): ${picked.map(name).join(", ") || "—"}`, hint ? h("span", { class: "warn" }, " " + hint) : null),
    h("div", { class: "grid" }, ...offer.map((_, i) => soulCard(i))),
    h("p", { class: "seed" }, `semilla de las almas: ${offerSeed}`),
  );
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ colocación (cuadrícula 2×2, una casilla vacía)
function putIn(slot: number, si: number): void {
  const occ = slots[slot - 1] ?? null;
  const old = slots.indexOf(si);
  if (old >= 0) slots[old] = occ; // intercambio (o la casilla queda vacía)
  slots[slot - 1] = si;
  selSoul = null;
  render();
}
function clickCell(slot: number): void {
  const occ = slots[slot - 1] ?? null;
  if (selSoul !== null) {
    if (occ === selSoul) selSoul = null;
    else return putIn(slot, selSoul);
  } else if (occ !== null) selSoul = occ;
  render();
}
function clickChip(si: number): void {
  selSoul = selSoul === si ? null : si;
  render();
}
function shapeLabel(): string {
  const front = [1, 2].filter((p) => slots[p - 1] !== null).length;
  return front === 2 ? "2 delante + 1 detrás" : front === 1 ? "1 delante + 2 detrás" : "—";
}

function renderPlace(): void {
  const team = picked.map((i) => offer[i] as Soul);
  let dragging: number | null = null;
  const cell = (slot: number): HTMLElement => {
    const si = slots[slot - 1] ?? null;
    const soul = si === null ? null : (team[si] as Soul);
    const b = h(
      "button",
      {
        class: "pcell" + (soul ? " full" : "") + (si !== null && si === selSoul ? " sel" : "") + (si === null && selSoul !== null ? " ready" : ""),
        "data-slot": slot,
        draggable: soul ? "true" : undefined,
        style: soul ? `--fam:${palette(soul.combatant.family).main}` : undefined,
        onclick: () => clickCell(slot),
        ondragstart: (() => (dragging = si)) as EventListener,
        ondragover: ((e: Event) => e.preventDefault()) as EventListener,
        ondrop: ((e: Event) => { e.preventDefault(); if (dragging !== null) putIn(slot, dragging); }) as EventListener,
      },
      soul ? soulShape(soul.combatant.family, 38) : null,
      soul ? h("span", { class: "pn" }, soul.name) : h("span", { class: "pe" }, selSoul !== null ? "Colocar aquí" : "Vacía"),
      soul ? h("small", null, familyLabel(soul.combatant.family)) : null,
    );
    return b;
  };
  const pool = team.map((s, si) => ({ s, si })).filter((x) => !slots.includes(x.si));
  const chip = ({ s, si }: { s: Soul; si: number }): HTMLElement =>
    h("button", { class: "pchip" + (si === selSoul ? " sel" : ""), "data-soul": si, draggable: "true", style: `--fam:${palette(s.combatant.family).main}`, onclick: () => clickChip(si), ondragstart: (() => (dragging = si)) as EventListener }, soulShape(s.combatant.family, 30), h("span", { class: "pn" }, s.name));
  const ok = slots.filter((x) => x !== null).length === 3;
  const placement = (): number[] => team.map((_, si) => slots.indexOf(si) + 1);
  app.replaceChildren(
    topBar(),
    h("p", { class: "intro" }, "Coloca tus 3 almas: toca un alma y luego una casilla, o arrástrala. El rival coloca a ciegas; no verás su formación hasta empezar."),
    h(
      "div",
      { class: "pgrid" },
      h("div", { class: "prl" }, h("b", null, "Delantera"), h("span", null, " recibe los ataques mientras viva")),
      h("div", { class: "prow" }, cell(1), cell(2)),
      h("div", { class: "prl" }, h("b", null, "Trasera"), h("span", null, " a salvo mientras viva la delantera (salvo «atrás»)")),
      h("div", { class: "prow" }, cell(3), cell(4)),
    ),
    h("div", { class: "ppool", ondragover: ((e: Event) => e.preventDefault()) as EventListener, ondrop: ((e: Event) => { e.preventDefault(); if (dragging !== null) { const o = slots.indexOf(dragging); if (o >= 0) slots[o] = null; render(); } }) as EventListener }, ...(pool.length ? pool.map(chip) : [h("span", { class: "dim" }, `Formación: ${shapeLabel()}`)])),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "btn", "data-preset": "21", onclick: () => ((slots = [0, 1, 2, null]), (selSoul = null), render()) }, "2 delante + 1 detrás"),
      h("button", { class: "btn", "data-preset": "12", onclick: () => ((slots = [0, null, 1, 2]), (selSoul = null), render()) }, "1 delante + 2 detrás"),
    ),
    h("div", { class: "actions" }, h("button", { class: "btn", onclick: () => ((phase = "team"), render()) }, "Volver"), h("button", { class: "btn primary grow", disabled: !ok || validatePlacement(placement(), cfg.combat) !== null, onclick: () => ok && startBattle(placement()) }, "¡Combatir!")),
  );
  window.scrollTo(0, 0);
}

function startBattle(placement: number[]): void {
  const team = picked.map((i) => offer[i] as Soul);
  const seed = pendingFightSeed ?? newSeed();
  pendingFightSeed = null;
  fight = startFight(team, placement, rollRival(seed), seed, chooseOpponentAi(difficulty));
  report = null;
  overlay = null;
  focus = 1;
  beginPlanning();
}

// ------------------------------------------------------------------ planificación del turno (bandeja de órdenes)
let inspect: number | null = null; // alma rival cuyos movimientos se consultan
let overlay: "prev" | "help" | null = null;
let chainTimer = 0;

function beginPlanning(): void {
  const f = fight as Fight;
  // todas las almas empiezan el turno con su movimiento gratis
  picks = [1, 2, 3, 4].map((p) => {
    const c = f.state.teams[0][p - 1];
    return { move: c ? freeMoveSlot(c) : 1 };
  });
  inspect = null;
  const el = eligibleActors(f.state, "A");
  if (!el.includes(focus)) focus = el[0] ?? ([1, 2, 3, 4].find((p) => f.mine[p - 1] && !f.state.fighters[0][p - 1]?.ko) ?? 1);
  phase = "plan";
  render();
}

function moveOf(f: Fight, pos: number, move: number): Move | null {
  return f.state.teams[0][pos - 1]?.moves[move - 1] ?? null;
}

function costOf(f: Fight, pos: number, move: number): number {
  return moveOf(f, pos, move)?.cost ?? 0;
}

function spentBy(f: Fight, except: number | null): number {
  return eligibleActors(f.state, "A")
    .filter((q) => q !== except)
    .reduce((a, q) => a + costOf(f, q, (picks[q - 1] as Pick).move), 0);
}

function selectMove(pos: number, move: number): void {
  (picks[pos - 1] as Pick).move = move;
  focus = pos;
  inspect = null;
  render();
}

// ---- descripción completa: al pasar el ratón o al mantener pulsado
const tipEl = document.createElement("div");
tipEl.className = "tip";
tipEl.hidden = true;
document.body.append(tipEl);
function showTip(anchor: HTMLElement, text: string): void {
  tipEl.textContent = text;
  tipEl.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = Math.min(300, window.innerWidth - 16);
  tipEl.style.width = `${w}px`;
  tipEl.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  tipEl.style.bottom = `${window.innerHeight - r.top + 6}px`;
}
function hideTip(): void {
  tipEl.hidden = true;
}
function withTip(btn: HTMLElement, text: string): HTMLElement {
  let timer = 0;
  let shown = false;
  btn.title = text;
  btn.addEventListener("mouseenter", () => showTip(btn, text));
  btn.addEventListener("mouseleave", hideTip);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  btn.addEventListener("pointerdown", (e) => {
    if ((e as PointerEvent).pointerType === "mouse") return;
    shown = false;
    timer = window.setTimeout(() => ((shown = true), showTip(btn, text)), 450);
  });
  const end = (): void => {
    clearTimeout(timer);
    if (shown) setTimeout(hideTip, 1800);
  };
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointercancel", end);
  btn.addEventListener("click", (e) => {
    if (shown) {
      e.stopImmediatePropagation();
      e.preventDefault();
      shown = false;
    }
  }, true);
  return btn;
}

const REST_ICON = `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.4 1.6"/></svg>`;

function optButton(m: Move, slot: number, state: "on" | "rest" | "ro" | "", disabled: boolean, onclick?: () => void): HTMLElement {
  const full = describeMove(m, cfg.moves);
  const rest = state === "rest";
  const b = h(
    "button",
    { class: `opt ${state}`, "aria-disabled": rest || state === "ro" ? "true" : undefined, "data-slot": slot, "data-free": m.cost === 0 ? "1" : undefined, disabled: disabled && !rest, onclick: (() => !rest && state !== "ro" && onclick?.()) as EventListener },
    h("span", { class: "oname" }, h("span", { class: "nm" }, m.name), h("span", { class: "cost" }, m.cost === 0 ? "gratis" : `${m.cost}⚡`)),
    rest ? h("span", { class: "mdesc rest" }) : h("span", { class: "mdesc" }, describeMoveShort(m, cfg.moves)),
  );
  if (rest) (b.querySelector(".mdesc") as HTMLElement).innerHTML = `${REST_ICON} descansa`;
  return withTip(b, full);
}

function trayPlan(f: Fight): HTMLElement {
  const confirm = h("button", { class: "btn primary big confirm", onclick: () => confirmTurn() }, "Confirmar turno");
  let head: HTMLElement;
  let body: HTMLElement;
  if (inspect !== null) {
    const soul = f.rival[inspect - 1] as Soul;
    const fs = f.state.fighters[1][inspect - 1] as BattleState["fighters"][0][0];
    head = h("div", { class: "thead" }, soulShape(soul.combatant.family, 30), h("b", { class: "nb" }, `${soul.name} (rival)`), h("small", null, `${familyLabel(soul.combatant.family)} · ${rowName(inspect)}${fs.ko ? " · KO" : ` · vida ${fs.hp}/${soul.combatant.maxHp}`}`), h("span", { class: "tnote" }, "Sus movimientos"));
    body = h("div", { class: "opts5" }, ...orderedMoves(soul.combatant).map(({ m, slot }) => optButton(m, slot, "ro", false)));
  } else {
    const pos = focus;
    const soul = f.mine[pos - 1] as Soul;
    const fs = f.state.fighters[0][pos - 1] as BattleState["fighters"][0][0];
    const p = picks[pos - 1] as Pick;
    const fc = eligibleActors(f.state, "A").includes(pos) ? forecastTargets(f.state, "A", pos, p.move, cfg) : null;
    const nm = fc ? (fc.side === "A" ? f.mine : f.rival) : [];
    const tgt = !fc ? "" : "Irá a: " + (fc.positions.map((q) => nm[q - 1]?.name ?? "?").join(" y ") || "nadie");
    head = h("div", { class: "thead" }, soulShape(soul.combatant.family, 30), h("b", { class: "na" }, soul.name), h("small", null, `${familyLabel(soul.combatant.family)} · ${rowName(pos)}`), h("span", { class: "tnote hot", title: "Previsión: el objetivo se decide al actuar" }, tgt));
    if (fs.ko) body = h("div", { class: "opts5 msg" }, "Esta alma está KO.");
    else if (!eligibleActors(f.state, "A").includes(pos)) body = h("div", { class: "opts5 msg" }, "Aturdida: pierde este turno.");
    else {
      const avail = f.state.energy[0] - spentBy(f, pos);
      const resting = restingMoves(f.state, "A", pos);
      body = h("div", { class: "opts5" }, ...orderedMoves(soul.combatant).map(({ m, slot }) => optButton(m, slot, resting.includes(slot) ? "rest" : p.move === slot ? "on" : "", m.cost > avail, () => selectMove(pos, slot))));
    }
  }
  return h("div", { class: "tray" }, head, body, confirm);
}

function currentPlan(f: Fight): { plan: Action[]; cost: number } {
  const plan: Action[] = eligibleActors(f.state, "A").map((pos) => ({ actor: pos, move: (picks[pos - 1] as Pick).move, target: 0 }));
  return { plan, cost: plan.reduce((a, x) => a + costOf(f, x.actor, x.move), 0) };
}

function onPickPlan(side: SideId, pos: number): void {
  const f = fight as Fight;
  if (side === "A") {
    focus = pos;
    inspect = null;
  } else {
    if ((f.state.fighters[1][pos - 1] as BattleState["fighters"][0][0]).ko) return;
    inspect = pos;
  }
  render();
}

function overlayBox(): HTMLElement | "" {
  if (overlay === null) return "";
  const f = fight as Fight;
  const close = h("button", { class: "btn", onclick: () => toggleOverlay(null) }, "Cerrar");
  if (overlay === "help") return h("div", { class: "ov" }, h("div", { class: "ovp" }, h("div", { class: "ovh" }, h("b", null, "Ayuda"), close), ...HELP.map(([t, x]) => h("p", null, h("b", null, t + ". "), x)), ...glossaryNodes(), h("p", { class: "seed" }, `semilla de las almas: ${offerSeed} · semilla del combate: ${f.seed}`)));
  const r = report;
  return h("div", { class: "ov" }, h("div", { class: "ovp" }, h("div", { class: "ovh" }, h("b", null, "Turno anterior"), close), h("div", { class: "log" }, ...(r ? r.lines.map(lineNode) : [h("div", { class: "ln info" }, "Aún no se ha jugado ningún turno.")]))));
}
function toggleOverlay(o: "prev" | "help" | null): void {
  overlay = o;
  const cur = document.querySelector(".ov");
  if (cur) cur.remove();
  const box = overlayBox();
  if (box) app.append(box);
}

function turnBar(f: Fight, left: string, withBtns: boolean): HTMLElement {
  return h(
    "div",
    { class: "turnbar" },
    h("b", null, left),
    h("span", { class: "score", id: "score" }, `Partidas: ${score.played} · Ganadas: ${score.won}`),
    withBtns ? h("span", { class: "tbr" }, report ? h("button", { class: "btn sm", onclick: () => toggleOverlay("prev") }, "Turno anterior") : null, h("button", { class: "btn sm", onclick: () => toggleOverlay("help") }, "Ayuda")) : h("span", { class: "tbr" }, h("button", { class: "btn sm", onclick: () => toggleOverlay("help") }, "Ayuda")),
  );
}

function renderPlan(): void {
  const f = fight as Fight;
  const { cost } = currentPlan(f);
  const elig = eligibleActors(f.state, "A");
  if (!elig.includes(focus) && inspect === null) focus = elig[0] ?? ([1, 2, 3, 4].find((p) => f.mine[p - 1] && !f.state.fighters[0][p - 1]?.ko) ?? focus);
  const tgts: { side: SideId; pos: number }[] = [];
  const lines: NonNullable<Sel["lines"]> = [];
  const orders: Record<number, { txt: string; title: string }> = {};
  for (const pos of elig) {
    const p = picks[pos - 1] as Pick;
    const m = moveOf(f, pos, p.move);
    const fc = forecastTargets(f.state, "A", pos, p.move, cfg);
    const isF = inspect === null && pos === focus;
    if (fc) {
      lines.push({ from: pos, side: fc.side, to: fc.positions, focus: isF, pay: !!m && m.cost > 0 });
      if (isF) for (const q of fc.positions) tgts.push({ side: fc.side, pos: q });
    }
    if (m && m.cost > 0) orders[pos] = { txt: `⚡${m.cost}`, title: `${m.name} (${m.cost} de energía)` };
  }
  const atk = attackable(f.state, "B", cfg);
  app.replaceChildren(
    turnBar(f, `Turno ${f.state.turn}/${cfg.combat.maxTurns}`, true),
    energyBar(f.state.energy[0], cost),
    buildField(f, f.state, { actor: inspect === null && elig.includes(focus) ? focus : null, tgts, onPick: onPickPlan, orders, atk: atk.row, taunt: atk.taunting, lines }).el,
    trayPlan(f),
    overlayBox(),
  );
}

function confirmTurn(): void {
  const f = fight as Fight;
  const { plan } = currentPlan(f);
  const { before, events } = playTurn(f, plan);
  report = { lines: narrate(before, events, f.names).lines, before, events };
  pendingResult = f.state.result;
  phase = "report";
  render();
}

// ------------------------------------------------------------------ informe del turno y fin de partida
function lineNode(l: LogLine): HTMLElement {
  return h("div", { class: "ln " + l.kind }, ...l.parts.map(partNode));
}

function sameTeamAgain(): void {
  const f = fight as Fight;
  const seed = newSeed();
  fight = startFight(f.team, f.placement, rollRival(seed), seed, chooseOpponentAi(difficulty));
  report = null;
  overlay = null;
  focus = 1;
  beginPlanning();
}
function newTeam(): void {
  phase = "team";
  newOffer();
  window.scrollTo(0, 0);
}

function renderReport(): void {
  const f = fight as Fight;
  const r = report as NonNullable<typeof report>;
  const res = f.state.result;
  const field = buildField(f, r.before);
  const sub = h("div", { class: "sub", "aria-live": "polite" }, "");
  const speedBtn = (v: 1 | 2): HTMLElement =>
    h("button", { class: "btn sm sp" + (speed === v ? " on" : ""), "data-v": v, onclick: ((e: Event) => {
      speed = v;
      saveSpeed();
      player?.setSpeed(v);
      for (const b of Array.from(document.querySelectorAll(".sp"))) b.classList.toggle("on", (b as HTMLElement).dataset["v"] === String(v));
      (e.currentTarget as HTMLElement).blur();
    }) as EventListener }, `×${v}`);
  const skipBtn = h("button", { class: "btn sm", onclick: () => player?.skip() }, "Saltar");
  const ctrl = h("div", { class: "ctrl" }, h("span", { class: "lbl" }, "Velocidad"), speedBtn(1), speedBtn(2), skipBtn);
  const end = res === null ? null : h(
    "div",
    { class: "endbox " + (res === "A" ? "win" : res === "B" ? "lose" : "draw"), hidden: true },
    h("h2", null, res === "A" ? "¡Victoria!" : res === "B" ? "Derrota" : "Empate"),
    h("p", { id: "endscore" }, `Turnos jugados: ${f.state.turn}.`),
    h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => sameTeamAgain() }, "Otra partida (mismo equipo)"), h("button", { class: "btn", onclick: () => newTeam() }, "Otra partida (equipo nuevo)"), h("button", { class: "btn", onclick: () => toggleOverlay("prev") }, "Detalle del turno")),
  );
  app.replaceChildren(
    turnBar(f, `Turno ${res === null ? f.state.turn - 1 : f.state.turn}`, false),
    energyBar(r.before.energy[0], 0),
    field.el,
    h("div", { class: "tray anim" }, sub, ctrl, end ?? ""),
    overlayBox(),
  );
  player = playAnim(field, r.before, f.state, r.events, f.names, sub, speed, () => {
    ctrl.classList.add("off");
    commitScore();
    player = null;
    if (end) end.removeAttribute("hidden");
    // encadena: empieza la planificación del turno siguiente sin pulsar nada
    else chainTimer = window.setTimeout(() => phase === "report" && fight === f && beginPlanning(), 650);
  });
}

/** Suma la partida al marcador (una sola vez) cuando termina la animación del turno final. */
function commitScore(): void {
  if (pendingResult === null) return;
  score.played++;
  if (pendingResult === "A") score.won++;
  pendingResult = null;
  saveScore();
  const sc = document.getElementById("score");
  if (sc) sc.textContent = `Partidas: ${score.played} · Ganadas: ${score.won}`;
  const ep = document.getElementById("endscore");
  if (ep) ep.textContent = `Turnos jugados: ${(fight as Fight).state.turn}. Partidas: ${score.played} · ganadas: ${score.won}.`;
}

function render(): void {
  clearTimeout(chainTimer);
  hideTip();
  app.className = phase === "team" ? "" : phase === "place" ? "place" : "battle";
  if (player) {
    player.cancel();
    commitScore();
  }
  player = null;
  if (phase === "team") renderTeam();
  else if (phase === "place") renderPlace();
  else if (phase === "plan") renderPlan();
  else renderReport();
}

render();
