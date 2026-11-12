/** Interfaz del combate jugable (DOM sin dependencias). Estados: team → plan ⇄ report. */
import { describeMove, validTargetPositions, eligibleActors, restingMoves, type Action, type BattleEvent, type BattleState, type Move, type SideId } from "../../packages/core/src/index.ts";
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
type Phase = "team" | "plan" | "report";
interface Pick {
  move: number;
  target: number;
}
const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
let offerSeed = params.get("oferta") ?? newSeed();
let pendingFightSeed: string | null = params.get("combate");
let offer: Soul[] = rollOffer(offerSeed);
let front: number[] = [];
let back: number[] = [];
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
  B: [[46, 36], [70, 46], [64, 15], [86, 23]],
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
  /** Orden actual de cada alma propia (posición → texto del indicador y título). */
  orders?: Record<number, { txt: string; title: string }>;
}

/** Escena de batalla: almas flotando sobre plataformas, sin cartas. Devuelve los elementos para animarlos.
 *  El nombre y la vida de cada alma van en una capa propia (`.iw`) por encima de todos los iconos: así una delantera no tapa la trasera. */
function buildField(f: Fight, st: BattleState, sel?: Sel): Field {
  const units = new Map<string, UnitEls>();
  const energy = { A: h("span", { class: "en" }), B: h("span", { class: "en" }) } as Record<SideId, HTMLElement>;
  const layer: HTMLElement[] = [];
  const unit = (side: SideId, pos: number): HTMLElement => {
    const i = SIDE[side];
    const soul = (i === 0 ? f.mine : f.rival)[pos - 1] as Soul;
    const c = soul.combatant;
    const [x, y] = SPOT[side][pos - 1] as [number, number];
    const front = cfg.combat.frontRow.includes(pos);
    const ico = h("div", { class: "ico" }, soulShape(c.family, 100));
    const bar = h("i", null);
    const hp = h("div", { class: "hpn" });
    const chips = h("div", { class: "chips" });
    const o = side === "A" ? sel?.orders?.[pos] : undefined;
    const base = [side === "A" ? "mine" : "foe", front ? "front" : "back"];
    const vars = `--fam:${palette(c.family).main};--x:${x}%;--y:${y}%`;
    const iw = h("div", { class: "iw " + base.join(" "), style: vars }, h("div", { class: "info" }, h("div", { class: "uname" }, soul.name), h("div", { class: "bar" }, bar), chips, hp), o ? h("span", { class: "ord", title: o.title }, o.txt) : null);
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
  for (const side of ["B", "A"] as SideId[]) for (let p = 1; p <= 4; p++) all.push(unit(side, p));
  const el = h("div", { class: "stage" }, h("div", { class: "bg" }, h("div", { class: "stars" }), h("div", { class: "floor" })), plat("pf"), plat("pm"), h("div", { class: "tag t2" }, "Tú · ", energy.A), ...all, ...layer);
  return { el, units, energy };
}

const HELP: [string, string][] = [
  ["Energía", "Todo tu bando comparte una reserva: 3 al empezar y +3 cada turno (máximo 10). Cada movimiento cuesta 1–5; el golpe básico es gratis. Lo que no gastas se guarda, pero no pasa de 10."],
  ["Turnos simultáneos", "Tú y el rival elegís a la vez, sin ver el plan del otro. Cada alma viva actúa una vez por turno (si no está aturdida). Desde el turno 11 el daño sube un 25 % por turno; en el 20 sin ganador hay empate."],
  ["Filas", "Delantera (posiciones 1–2) y trasera (3–4). Los ataques normales solo alcanzan la fila delantera enemiga; si no queda nadie vivo ahí, la trasera. Con alcance se puede apuntar a cualquiera. Los de área golpean a toda una fila."],
  ["Iniciativa", "Decide quién actúa antes dentro del turno (con algo de azar). Prisa suma y ralentizar resta. Los movimientos de curación y protección, y los que tienen prioridad, actúan primero."],
  ["Estados", "Quemadura: 12 de daño por pila al final del turno (hasta 3 pilas). Ralentizar: -30 de iniciativa. Aturdir: pierde su próxima acción. Marca: recibe x1,2. Debilitar: inflige x0,8. Escudo: absorbe daño. Prisa: +30 de iniciativa. Regenerar: +15 de vida por turno."],
  ["Familias", "Anillo base: Marea > Llama > Brote > Roca > Voltio > Sombra > Marea (cada una gana a la siguiente: x1,25, y pierde contra la anterior: x0,8). Las híbridas tienen su propio anillo: Vapor > Magma > Espora > Liquen > Plasma > Tormenta > Abismo > Vapor."],
  ["Sinergia", "Si 2, 3 o 4 de tus almas usan movimientos de la misma familia en el mismo turno, esos movimientos ganan +10 %, +20 % o +30 % de potencia. El golpe básico no cuenta."],
];

function helpBox(): HTMLElement {
  return h("details", { class: "help" }, h("summary", null, "Ayuda: cómo se juega"), ...HELP.map(([t, x]) => h("p", null, h("b", null, t + ". "), x)));
}

function topBar(): HTMLElement {
  return h("div", { class: "top" }, h("h1", null, "Proyecto Genoma · Combate"), h("div", { class: "score", id: "score" }, `Partidas: ${score.played} · Ganadas: ${score.won}`));
}

// ------------------------------------------------------------------ pantalla de equipo
function toggleSoul(i: number): void {
  const fi = front.indexOf(i);
  const bi = back.indexOf(i);
  hint = "";
  if (fi >= 0) front.splice(fi, 1);
  else if (bi >= 0) back.splice(bi, 1);
  else if (front.length < 2) front.push(i);
  else if (back.length < 2) back.push(i);
  else hint = "Ya tienes 4 almas: quita una antes de elegir otra.";
  render();
}
function setRow(i: number, toFront: boolean): void {
  const from = toFront ? back : front;
  const to = toFront ? front : back;
  const fi = from.indexOf(i);
  if (fi < 0) return;
  from.splice(fi, 1);
  if (to.length >= 2) from.push(to.shift() as number);
  to.push(i);
  render();
}
function randomTeam(): void {
  const idxs = offer.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j] as number, idxs[i] as number];
  }
  front = idxs.slice(0, 2);
  back = idxs.slice(2, 4);
  hint = "";
  render();
}
function newOffer(): void {
  offerSeed = newSeed();
  offer = rollOffer(offerSeed);
  front = [];
  back = [];
  hint = "";
  render();
}

function soulCard(i: number): HTMLElement {
  const s = offer[i] as Soul;
  const c = s.combatant;
  const inF = front.indexOf(i) >= 0;
  const inB = back.indexOf(i) >= 0;
  const pal = palette(c.family);
  const moves = c.moves.map((m: Move) => {
    const d = describeMove(m, cfg.moves);
    return h("li", null, h("b", null, m.name), h("span", { class: "cost" }, ` ${m.cost}⚡`), h("div", { class: "mdesc" }, d.slice(d.indexOf("): ") + 3)));
  });
  return h(
    "div",
    { class: `scard${inF || inB ? " picked" : ""}`, style: `--fam:${pal.main}`, role: "button", tabindex: 0, onclick: () => toggleSoul(i), onkeydown: ((e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggleSoul(i))) as EventListener },
    h("div", { class: "fhead" }, soulShape(c.family, 64), h("div", { class: "fname" }, h("b", null, s.name), h("small", null, familyLabel(c.family)))),
    h("div", { class: "stats" }, h("span", null, `Vida ${c.maxHp}`), h("span", null, `Ataque ${c.attack.toFixed(2)}`), h("span", null, `Iniciativa ${Math.round(c.initiative)}`)),
    h("ul", { class: "moves" }, ...moves),
    inF || inB
      ? h(
          "div",
          { class: "rowpick" },
          h("button", { class: inF ? "on" : "", onclick: ((e: Event) => (e.stopPropagation(), setRow(i, true))) as EventListener }, "Delantera"),
          h("button", { class: inB ? "on" : "", onclick: ((e: Event) => (e.stopPropagation(), setRow(i, false))) as EventListener }, "Trasera"),
        )
      : null,
  );
}

function startBattle(): void {
  const mineIdx = [...front, ...back];
  const mine = mineIdx.map((i) => offer[i] as Soul);
  const seed = pendingFightSeed ?? newSeed();
  pendingFightSeed = null;
  fight = startFight(mine, rollRival(seed), seed, chooseOpponentAi(difficulty));
  report = null;
  overlay = null;
  focus = 1;
  beginPlanning();
}

function renderTeam(): void {
  const ready = front.length === 2 && back.length === 2;
  const name = (i: number): string => (offer[i] as Soul).name;
  app.replaceChildren(
    topBar(),
    h("p", { class: "intro" }, "Elige 4 almas y su fila (2 delanteras y 2 traseras). Toca una carta para elegirla."),
    helpBox(),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "btn", onclick: () => randomTeam() }, "Equipo aleatorio"),
      h("button", { class: "btn", onclick: () => newOffer() }, "Nuevas almas"),
      h("button", { class: "btn primary", disabled: !ready, onclick: () => ready && startBattle() }, "¡Combatir!"),
    ),
    h("div", { class: "diff" }, h("span", { class: "lbl" }, "Dificultad del rival"), h("button", { class: "btn" + (difficulty === "normal" ? " on" : ""), onclick: () => ((difficulty = "normal"), render()) }, "Normal"), h("button", { class: "btn" + (difficulty === "dificil" ? " on" : ""), onclick: () => ((difficulty = "dificil"), render()) }, "Difícil")),
    h("p", { class: "sel" }, `Delantera: ${front.map(name).join(", ") || "—"} · Trasera: ${back.map(name).join(", ") || "—"}`, hint ? h("span", { class: "warn" }, " " + hint) : null),
    h("div", { class: "grid" }, ...offer.map((_, i) => soulCard(i))),
    h("p", { class: "seed" }, `semilla de las almas: ${offerSeed}`),
  );
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ planificación del turno (bandeja de órdenes)
let armed = false; // esperando que se toque el objetivo en el campo
let inspect: number | null = null; // alma rival cuyos movimientos se consultan
let note = "";
let overlay: "prev" | "help" | null = null;
let chainTimer = 0;

function defaultFoe(f: Fight): number {
  return validTargetPositions(null, alive(f.state, "B"), cfg.combat)[0] ?? 1;
}

function beginPlanning(): void {
  const f = fight as Fight;
  // todas las almas empiezan el turno con el golpe básico contra la primera delantera enemiga viva
  picks = [1, 2, 3, 4].map(() => ({ move: 0, target: defaultFoe(f) }));
  armed = false;
  inspect = null;
  note = "";
  const el = eligibleActors(f.state, "A");
  if (!el.includes(focus)) focus = el[0] ?? 1;
  phase = "plan";
  render();
}

function moveOf(f: Fight, pos: number, move: number): Move | null {
  return move === 0 ? null : (f.state.teams[0][pos - 1] as BattleState["teams"][0][0]).moves[move - 1] ?? null;
}

function targetsFor(f: Fight, m: Move | null): { side: SideId; valid: number[] } {
  const side: SideId = m && m.target === "aliado" ? "A" : "B";
  return { side, valid: validTargetPositions(m, alive(f.state, side), cfg.combat) };
}

function costOf(f: Fight, pos: number, move: number): number {
  const m = moveOf(f, pos, move);
  return m ? m.cost : cfg.combat.damage.basicCost;
}

function spentBy(f: Fight, except: number | null): number {
  return eligibleActors(f.state, "A")
    .filter((q) => q !== except)
    .reduce((a, q) => a + costOf(f, q, (picks[q - 1] as Pick).move), 0);
}

function selectMove(pos: number, move: number): void {
  const f = fight as Fight;
  const p = picks[pos - 1] as Pick;
  const prev = targetsFor(f, moveOf(f, pos, p.move)).side;
  p.move = move;
  focus = pos;
  inspect = null;
  note = "";
  const m = moveOf(f, pos, move);
  const t = targetsFor(f, m);
  if (t.side === "A") {
    if (prev !== "A" || !t.valid.includes(p.target)) p.target = t.valid.includes(pos) ? pos : t.valid[0] ?? pos;
  } else if (prev !== "B" || !t.valid.includes(p.target)) p.target = t.valid.includes(defaultFoe(f)) ? defaultFoe(f) : t.valid[0] ?? 1;
  // un movimiento de un solo objetivo con varios posibles pide tocarlo en el campo; los de área, no
  armed = !(m && m.area) && t.valid.length > 1;
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

function optButton(m: Move | null, slot: number, cost: number, state: "on" | "rest" | "ro" | "", disabled: boolean, onclick?: () => void): HTMLElement {
  const full = m ? describeMove(m, cfg.moves) : `Golpe básico (gratis): ${cfg.combat.damage.basicPower} de daño (x ataque) a un enemigo`;
  const short = m ? full.slice(full.indexOf("): ") + 3) : `${cfg.combat.damage.basicPower} de daño a un enemigo`;
  const rest = state === "rest";
  const b = h(
    "button",
    { class: `opt ${state}`, "aria-disabled": rest || state === "ro" ? "true" : undefined, "data-slot": slot, disabled: disabled && !rest, onclick: (() => !rest && state !== "ro" && onclick?.()) as EventListener },
    h("span", { class: "oname" }, h("span", { class: "onum" }, slot === 0 ? "B" : String(slot)), h("span", { class: "nm" }, m ? m.name : "Golpe básico"), h("span", { class: "cost" }, cost === 0 ? "gratis" : `${cost}⚡`)),
    rest ? h("span", { class: "mdesc rest" }) : h("span", { class: "mdesc" }, short),
  );
  if (rest) (b.querySelector(".mdesc") as HTMLElement).innerHTML = `${REST_ICON} descansa`;
  return withTip(b, full);
}

function trayPlan(f: Fight, cost: number): HTMLElement {
  const confirm = h("button", { class: "btn primary big confirm", onclick: () => confirmTurn() }, "Confirmar turno");
  let head: HTMLElement;
  let body: HTMLElement;
  if (inspect !== null) {
    const soul = f.rival[inspect - 1] as Soul;
    const fs = f.state.fighters[1][inspect - 1] as BattleState["fighters"][0][0];
    head = h("div", { class: "thead" }, soulShape(soul.combatant.family, 30), h("b", { class: "nb" }, `${soul.name} (rival)`), h("small", null, `${familyLabel(soul.combatant.family)} · ${rowName(inspect)}${fs.ko ? " · KO" : ` · vida ${fs.hp}/${soul.combatant.maxHp}`}`), h("span", { class: "tnote" }, "Costes de sus movimientos"));
    body = h("div", { class: "opts5" }, ...soul.combatant.moves.map((m, k) => optButton(m, k + 1, m.cost, "ro", false)), optButton(null, 0, cfg.combat.damage.basicCost, "ro", false));
  } else {
    const pos = focus;
    const soul = f.mine[pos - 1] as Soul;
    const fs = f.state.fighters[0][pos - 1] as BattleState["fighters"][0][0];
    const p = picks[pos - 1] as Pick;
    const mv = moveOf(f, pos, p.move);
    const t = targetsFor(f, mv);
    const tn = (t.side === "A" ? f.mine : f.rival).map((s) => s.name);
    const tgt = mv && mv.area ? `Área: fila ${rowName(p.target).toLowerCase()}` : t.valid.length === 0 ? "" : `Objetivo: ${tn[p.target - 1] ?? "?"}`;
    head = h("div", { class: "thead" }, soulShape(soul.combatant.family, 30), h("b", { class: "na" }, soul.name), h("small", null, `${familyLabel(soul.combatant.family)} · ${rowName(pos)}`), h("span", { class: "tnote" + (armed || note ? " hot" : "") }, note || (armed ? "Toca el objetivo en el campo" : tgt)));
    if (fs.ko) body = h("div", { class: "opts5 msg" }, "Esta alma está KO.");
    else if (!eligibleActors(f.state, "A").includes(pos)) body = h("div", { class: "opts5 msg" }, "Aturdida: pierde este turno.");
    else {
      const avail = f.state.energy[0] - spentBy(f, pos);
      const resting = restingMoves(f.state, "A", pos);
      body = h(
        "div",
        { class: "opts5" },
        ...soul.combatant.moves.map((m, k) => optButton(m, k + 1, m.cost, resting.includes(k + 1) ? "rest" : p.move === k + 1 ? "on" : "", m.cost > avail, () => selectMove(pos, k + 1))),
        optButton(null, 0, cfg.combat.damage.basicCost, p.move === 0 ? "on" : "", false, () => selectMove(pos, 0)),
      );
    }
  }
  void cost;
  return h("div", { class: "tray" }, head, body, confirm);
}

function currentPlan(f: Fight): { plan: Action[]; cost: number } {
  const plan: Action[] = eligibleActors(f.state, "A").map((pos) => {
    const p = picks[pos - 1] as Pick;
    return { actor: pos, move: p.move, target: p.target };
  });
  return { plan, cost: plan.reduce((a, x) => a + costOf(f, x.actor, x.move), 0) };
}

function onPickPlan(side: SideId, pos: number): void {
  const f = fight as Fight;
  const fp = picks[focus - 1] as Pick;
  const ft = targetsFor(f, moveOf(f, focus, fp.move));
  note = "";
  if (armed && side === ft.side && ft.valid.includes(pos)) {
    fp.target = pos;
    armed = false;
    inspect = null;
    render();
    return;
  }
  if (side === "A") {
    focus = pos;
    armed = false;
    inspect = null;
    render();
    return;
  }
  if (armed) {
    note = ft.side === "B" ? "Ese rival no es alcanzable: toca otro" : "Toca un aliado";
    render();
    return;
  }
  if ((f.state.fighters[1][pos - 1] as BattleState["fighters"][0][0]).ko) return;
  inspect = pos;
  render();
}

function overlayBox(): HTMLElement | "" {
  if (overlay === null) return "";
  const f = fight as Fight;
  const close = h("button", { class: "btn", onclick: () => toggleOverlay(null) }, "Cerrar");
  if (overlay === "help") return h("div", { class: "ov" }, h("div", { class: "ovp" }, h("div", { class: "ovh" }, h("b", null, "Ayuda"), close), ...HELP.map(([t, x]) => h("p", null, h("b", null, t + ". "), x)), h("p", { class: "seed" }, `semilla de las almas: ${offerSeed} · semilla del combate: ${f.seed}`)));
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
  if (!elig.includes(focus) && inspect === null) focus = elig[0] ?? focus;
  const fp = picks[focus - 1] as Pick;
  const fm = moveOf(f, focus, fp.move);
  const ft = targetsFor(f, fm);
  const tgts: { side: SideId; pos: number }[] = [];
  if (inspect === null && elig.includes(focus)) {
    if (armed) for (const p of ft.valid) tgts.push({ side: ft.side, pos: p });
    else if (fm && fm.area) for (const p of [1, 2, 3, 4]) { if (cfg.combat.frontRow.includes(p) === cfg.combat.frontRow.includes(fp.target) && ft.valid.length > 0) tgts.push({ side: ft.side, pos: p }); }
    else tgts.push({ side: ft.side, pos: fp.target });
  }
  const orders: Record<number, { txt: string; title: string }> = {};
  for (const pos of elig) {
    const p = picks[pos - 1] as Pick;
    const m = moveOf(f, pos, p.move);
    orders[pos] = { txt: p.move === 0 ? "B" : String(p.move), title: m ? m.name : "Golpe básico" };
  }
  app.replaceChildren(
    turnBar(f, `Turno ${f.state.turn}/${cfg.combat.maxTurns}`, true),
    energyBar(f.state.energy[0], cost),
    buildField(f, f.state, { actor: inspect === null && elig.includes(focus) ? focus : null, tgts, onPick: onPickPlan, orders }).el,
    trayPlan(f, cost),
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
  fight = startFight(f.mine, rollRival(seed), seed, chooseOpponentAi(difficulty));
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
  app.className = phase === "team" ? "" : "battle";
  if (player) {
    player.cancel();
    commitScore();
  }
  player = null;
  if (phase === "team") renderTeam();
  else if (phase === "plan") renderPlan();
  else renderReport();
}

render();
