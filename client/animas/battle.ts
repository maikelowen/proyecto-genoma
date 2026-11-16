/** Interfaz del combate de las ánimas: la escena y la bandeja del combate v0.5 (client/combat) con equipos de 1 a 3.
 *  Copia adaptada de client/combat/main.ts (sin pantallas de equipo/colocación ni marcador): el estado, la RNG y la IA salvaje los pone el juego (main.ts). */
import { attackable, describeMove, describeMoveShort, eligibleActors, forecastTargets, freeMoveSlot, lastAnimaPos, restingMoves, resolveTurn, validatePlan, type Action, type Ai, type BattleEvent, type BattleState, type Move, type Rng, type SideId } from "../../packages/core/src/index.ts";
import { cfg, familyLabel, gcfg, palette } from "../combat/data.ts";
import { SOUL_CSS, soulSvg } from "../art/soul.ts";
import type { Soul } from "../combat/game.ts";
import { key, narrate, type LogLine, type Part } from "../combat/narrate.ts";
import { paintEnergy, paintUnit, playTurn as playAnim, viewFrom, type Field, type Player, type UnitEls } from "../combat/anim.ts";
import { pcfg } from "./data.ts";

/** Lo que el juego entrega para un combate. `mine`/`rival` van por casilla (índice = casilla − 1; null = vacía). */
export interface BattleSetup {
  readonly app: HTMLElement;
  readonly state: BattleState;
  readonly rng: Rng;
  readonly ai: Ai;
  readonly mine: readonly (Soul | null)[];
  readonly rival: readonly (Soul | null)[];
  /** Zona y número de encuentro, solo para el pie de la ayuda. */
  readonly label: string;
  /** El combate acabó (se llama antes de la animación del último turno: el juego aplica el resultado y guarda). */
  readonly onEnd: (final: BattleState) => void;
  /** Tras la animación final, el jugador pulsa «Ver resultado». */
  readonly onDone: () => void;
  readonly onFlee: () => void;
}
interface Fight {
  state: BattleState;
  readonly rng: Rng;
  readonly ai: Ai;
  readonly mine: readonly (Soul | null)[];
  readonly rival: readonly (Soul | null)[];
  readonly names: readonly [readonly string[], readonly string[]];
}

// ------------------------------------------------------------------ utilidades DOM
export type Attrs = Record<string, string | number | boolean | EventListener | undefined> | null;
export type Kid = Node | string | null | false | undefined;
export function h(tag: string, attrs: Attrs, ...kids: Kid[]): HTMLElement {
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

interface Pick {
  move: number;
  /** Última ánima (v0.5): movimientos de pago marcados, en orden de ejecución. Vacío = el gratis. */
  seq: number[];
}
let fight: Fight | null = null;
let setup: BattleSetup;
let app: HTMLElement;
let picks: Pick[] = [];
let report: { lines: LogLine[]; before: BattleState; events: readonly BattleEvent[] } | null = null;
let player: Player | null = null;
let phase: "plan" | "report" = "plan";
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
let focus = 1;
let ended = false;

const SIDE: Record<SideId, 0 | 1> = { A: 0, B: 1 };
const alive = (s: BattleState, side: SideId): boolean[] => s.fighters[SIDE[side]].map((f) => !f.ko);
const rowName = (pos: number): string => (cfg.combat.frontRow.includes(pos) ? "Delantera" : "Trasera");

// ------------------------------------------------------------------ componentes visuales
/** Icono del alma: arte v3 generado desde sus genes (client/art/soul.ts). `ko` muestra los ojos de caída. */
function soulShape(soul: Soul, size: number, ko = false): SVGElement {
  const tpl = document.createElementNS(svgNS, "g");
  tpl.innerHTML = soulSvg(soul.creature, gcfg, { size, mood: ko ? "ko" : "idle", className: "soul" }); // SVG generado por nuestro código, nunca datos del usuario
  return tpl.firstElementChild as SVGElement;
}
// CSS del arte v3 (estados de los ojos y vaivén por temperamento), una sola vez
if (typeof document !== "undefined" && !document.getElementById("soul3-css")) {
  const st = document.createElement("style");
  st.id = "soul3-css";
  st.textContent = SOUL_CSS;
  document.head.append(st);
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
    const ico = h("div", { class: "ico" }, soulShape(soul, 100));
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

function v05Tag(): HTMLElement | null {
  return null;
}

function glossaryNodes(): HTMLElement[] {
  return [h("p", null, h("b", null, "Glosario")), h("dl", { class: "glos" }, ...GLOSARIO.flatMap(([w, d]) => [h("dt", null, w), h("dd", null, d)]))];
}

function orderedMoves(c: Soul["combatant"]): { m: Move; slot: number }[] {
  const fs = freeMoveSlot(c);
  const all = c.moves.map((m, k) => ({ m, slot: k + 1 }));
  return [...all.filter((x) => x.slot === fs), ...all.filter((x) => x.slot !== fs)];
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
    return { move: c ? freeMoveSlot(c) : 1, seq: [] };
  });
  inspect = null;
  const el = eligibleActors(f.state, "A", cfg);
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
  return eligibleActors(f.state, "A", cfg)
    .filter((q) => q !== except)
    .reduce((a, q) => a + pickCost(f, q), 0);
}

/** Casilla de la última ánima de mi bando este turno (0 si no aplica). */
function lastPos(f: Fight): number {
  return lastAnimaPos(f.state, "A", cfg);
}
const pickCost = (f: Fight, pos: number): number => {
  const p = picks[pos - 1] as Pick;
  return p.seq.length > 0 ? p.seq.reduce((a, m) => a + costOf(f, pos, m), 0) : costOf(f, pos, p.move);
};
let lastNoteSeen = false;

function selectMove(pos: number, move: number): void {
  const f = fight as Fight;
  const p = picks[pos - 1] as Pick;
  if (pos === lastPos(f)) {
    // última ánima: el gratis va solo; los pagos se marcan en orden (cada uno una vez)
    if (costOf(f, pos, move) === 0) p.seq = [];
    else {
      const k = p.seq.indexOf(move);
      if (k >= 0) p.seq.splice(k, 1);
      else if (p.seq.length < 3 && pickCost(f, pos) + costOf(f, pos, move) <= f.state.energy[0]) p.seq.push(move);
    }
    const fs = freeMoveSlot(f.state.teams[0][pos - 1] as NonNullable<BattleState["teams"][0][0]>);
    p.move = p.seq[0] ?? fs;
    focus = pos;
    inspect = null;
    render();
    return;
  }
  p.move = move;
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
    head = h("div", { class: "thead" }, soulShape(soul, 30), h("b", { class: "nb" }, `${soul.name} (rival)`), h("small", null, `${familyLabel(soul.combatant.family)} · ${rowName(inspect)}${fs.ko ? " · KO" : ` · vida ${fs.hp}/${soul.combatant.maxHp}`}`), h("span", { class: "tnote" }, "Sus movimientos"));
    body = h("div", { class: "opts5" }, ...orderedMoves(soul.combatant).map(({ m, slot }) => optButton(m, slot, "ro", false)));
  } else {
    const pos = focus;
    const soul = f.mine[pos - 1] as Soul;
    const fs = f.state.fighters[0][pos - 1] as BattleState["fighters"][0][0];
    const p = picks[pos - 1] as Pick;
    const fc = eligibleActors(f.state, "A", cfg).includes(pos) ? forecastTargets(f.state, "A", pos, p.move, cfg) : null;
    const nm = fc ? (fc.side === "A" ? f.mine : f.rival) : [];
    const tgt = !fc ? "" : "Irá a: " + (fc.positions.map((q) => nm[q - 1]?.name ?? "?").join(" y ") || "nadie");
    head = h("div", { class: "thead" }, soulShape(soul, 30), h("b", { class: "na" }, soul.name), h("small", null, `${familyLabel(soul.combatant.family)} · ${rowName(pos)}`), h("span", { class: "tnote hot", title: "Previsión: el objetivo se decide al actuar" }, tgt));
    if (fs.ko) body = h("div", { class: "opts5 msg" }, "Esta alma está KO.");
    else if (!eligibleActors(f.state, "A", cfg).includes(pos)) body = h("div", { class: "opts5 msg" }, "Aturdida: pierde este turno.");
    else {
      const isLast = pos === lastPos(f);
      const avail = f.state.energy[0] - (isLast ? pickCost(f, pos) : spentBy(f, pos));
      const resting = restingMoves(f.state, "A", pos, cfg);
      body = h("div", { class: "opts5" }, ...orderedMoves(soul.combatant).map(({ m, slot }) => {
        if (!isLast) return optButton(m, slot, resting.includes(slot) ? "rest" : p.move === slot ? "on" : "", m.cost > avail, () => selectMove(pos, slot));
        const n = p.seq.indexOf(slot);
        const on = m.cost === 0 ? p.seq.length === 0 : n >= 0;
        const b = optButton(m, slot, on ? "on" : "", !on && (m.cost > avail || (m.cost > 0 && p.seq.length >= 3)), () => selectMove(pos, slot));
        if (n >= 0) b.querySelector(".oname")?.prepend(h("span", { class: "seqn" }, String(n + 1)));
        return b;
      }));
    }
  }
  const notes: HTMLElement[] = [];
  if (lastPos(f) > 0 && !lastNoteSeen) notes.push(h("div", { class: "note" }, h("b", null, "Última ánima: "), "encadena varios pagos (se ejecutan en el orden marcado, sin descanso) o usa solo el gratis."));
  if (cfg.combat.energy.payOnConfirm && currentPlan(f).cost > 0) notes.push(h("div", { class: "note warn" }, "La energía se gasta al confirmar: si el ánima cae o la aturden antes de actuar, se pierde."));
  return h("div", { class: "tray" }, ...notes, head, body, confirm);
}

function currentPlan(f: Fight): { plan: Action[]; cost: number } {
  const plan: Action[] = eligibleActors(f.state, "A", cfg).flatMap((pos) => {
    const p = picks[pos - 1] as Pick;
    return (p.seq.length > 0 ? p.seq : [p.move]).map((move) => ({ actor: pos, move, target: 0 }));
  });
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
  if (overlay === "help") return h("div", { class: "ov" }, h("div", { class: "ovp" }, h("div", { class: "ovh" }, h("b", null, "Ayuda"), close), ...HELP.map(([t, x]) => h("p", null, h("b", null, t + ". "), x)), ...glossaryNodes(), h("p", { class: "seed" }, setup.label)));
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
    v05Tag(),
    withBtns ? h("span", { class: "tbr" }, h("button", { class: "btn sm", onclick: () => confirmFlee() }, "Huir"), report ? h("button", { class: "btn sm", onclick: () => toggleOverlay("prev") }, "Turno anterior") : null, h("button", { class: "btn sm", onclick: () => toggleOverlay("help") }, "Ayuda")) : h("span", { class: "tbr" }, h("button", { class: "btn sm", onclick: () => toggleOverlay("help") }, "Ayuda")),
  );
}

function renderPlan(): void {
  const f = fight as Fight;
  const { cost } = currentPlan(f);
  const elig = eligibleActors(f.state, "A", cfg);
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
    const pc = pickCost(f, pos);
    if (p.seq.length > 1) orders[pos] = { txt: `⚡${pc}`, title: p.seq.map((q) => moveOf(f, pos, q)?.name ?? "").join(" → ") + ` (${pc} de energía)` };
    else if (m && m.cost > 0) orders[pos] = { txt: `⚡${m.cost}`, title: `${m.name} (${m.cost} de energía)` };
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
  if (lastPos(f) > 0) lastNoteSeen = true;
  const { before, events } = playTurn(f, plan);
  report = { lines: narrate(before, events, f.names).lines, before, events };
  phase = "report";
  // el resultado se aplica y se guarda ANTES de mostrar nada (recargar no da otra tirada)
  if (f.state.result !== null && !ended) {
    ended = true;
    setup.onEnd(f.state);
  }
  render();
}

/** Valida el plan, pide el de las salvajes a la IA y resuelve el turno con la RNG del encuentro. */
function playTurn(f: Fight, plan: readonly Action[]): { before: BattleState; events: readonly BattleEvent[] } {
  const reason = validatePlan(f.state, "A", plan, cfg);
  if (reason !== null) throw new Error("plan inválido: " + reason);
  const before = f.state;
  const planB = f.ai(before, "B", pcfg.battle);
  const r = resolveTurn(before, plan, planB, f.rng, pcfg.battle);
  f.state = r.state;
  return { before, events: r.events };
}

function confirmFlee(): void {
  const close = (): void => document.querySelector(".ov")?.remove();
  const box = h("div", { class: "ov" }, h("div", { class: "ovp" }, h("div", { class: "ovh" }, h("b", null, "¿Huir del combate?")), h("p", null, "Huir no da experiencia ni castigo, pero tampoco podrás atrapar nada."), h("div", { class: "actions" }, h("button", { class: "btn", onclick: close }, "Seguir luchando"), h("button", { class: "btn primary", onclick: () => { close(); setup.onFlee(); } }, "Huir"))));
  app.append(box);
}

// ------------------------------------------------------------------ informe del turno y fin de partida
function lineNode(l: LogLine): HTMLElement {
  return h("div", { class: "ln " + l.kind }, ...l.parts.map(partNode));
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
    h("div", { class: "actions" }, h("button", { class: "btn primary grow", "data-act": "done", onclick: () => setup.onDone() }, "Ver resultado"), h("button", { class: "btn", onclick: () => toggleOverlay("prev") }, "Detalle del turno")),
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
    player = null;
    if (end) end.removeAttribute("hidden");
    // encadena: empieza la planificación del turno siguiente sin pulsar nada
    else chainTimer = window.setTimeout(() => phase === "report" && fight === f && beginPlanning(), 650);
  });
}

/** Suma la partida al marcador (una sola vez) cuando termina la animación del turno final. */
function render(): void {
  clearTimeout(chainTimer);
  hideTip();
  app.className = "battle";
  if (player) player.cancel();
  player = null;
  if (phase === "plan") renderPlan();
  else renderReport();
}

/** Empieza el combate descrito por `s` (sustituye el contenido de `s.app`). */
export function runBattle(s: BattleSetup): void {
  clearTimeout(chainTimer);
  setup = s;
  app = s.app;
  const names = (side: readonly (Soul | null)[]): string[] => side.map((x) => x?.name ?? "");
  fight = { state: s.state, rng: s.rng, ai: s.ai, mine: s.mine, rival: s.rival, names: [names(s.mine), names(s.rival)] };
  report = null;
  overlay = null;
  focus = 1;
  ended = false;
  lastNoteSeen = false;
  beginPlanning();
}

/** Corta animaciones y temporizadores (al salir del combate). */
export function stopBattle(): void {
  clearTimeout(chainTimer);
  player?.cancel();
  player = null;
  hideTip();
  fight = null;
}
