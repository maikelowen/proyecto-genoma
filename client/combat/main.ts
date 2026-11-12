/** Interfaz del combate jugable (DOM sin dependencias). Estados: team → plan ⇄ report. */
import { describeMove, validTargetPositions, eligibleActors, type Action, type BattleState, type Move, type SideId } from "../../packages/core/src/index.ts";
import { cfg, familyLabel, gcfg, palette } from "./data.ts";
import { SOUL_ART } from "./souls.ts";
import { newSeed, playTurn, rollOffer, rollRival, startFight, type Fight, type Soul } from "./game.ts";
import { key, narrate, statusName, type LogLine, type Part, type TurnMarks } from "./narrate.ts";

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
let report: { lines: LogLine[]; marks: TurnMarks } | null = null;
let hint = "";
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
  return h("div", { class: "energy" }, h("span", { class: "lbl" }, "Energía"), h("span", { class: "cells" }, ...cells), h("span", { class: "num" }, spent > 0 ? `${have - spent}/${have} (gastas ${spent})` : `${have}`));
}

function fighterCard(f: Fight, side: SideId, pos: number, marks: TurnMarks | null): HTMLElement {
  const i = SIDE[side];
  const soul = (i === 0 ? f.mine : f.rival)[pos - 1] as Soul;
  const fs = f.state.fighters[i][pos - 1] as BattleState["fighters"][0][0];
  const c = soul.combatant;
  const k = key(side, pos);
  const pal = palette(c.family);
  const pct = Math.max(0, Math.round((fs.hp / c.maxHp) * 100));
  const hurt = marks?.hurt.get(k);
  const healed = marks?.healed.get(k);
  const chips = fs.statuses.map((s) => h("span", { class: "chip " + cfg.combat.statuses[s.id].kind }, `${statusName(s.id)}${s.id === "quemadura" ? ` x${s.value}` : s.id === "escudo" ? ` ${s.value}` : ""} ${s.turns}t`));
  return h(
    "div",
    { class: `fcard ${side === "A" ? "mine" : "foe"}${fs.ko ? " ko" : ""}${marks?.acted.has(k) ? " acted" : ""}${hurt ? " hurt" : ""}`, style: `--fam:${pal.main}` },
    h("div", { class: "fhead" }, soulShape(c.family, 60, fs.ko), h("div", { class: "fname" }, h("b", null, soul.name), h("small", null, `${familyLabel(c.family)} · ${rowName(pos)}`))),
    h("div", { class: "bar" }, h("i", { style: `width:${pct}%` })),
    h("div", { class: "hptxt" }, fs.ko ? "KO" : `${fs.hp}/${c.maxHp}`, hurt ? h("span", { class: "dmg" }, ` −${hurt}`) : null, healed ? h("span", { class: "heal" }, ` +${healed}`) : null),
    marks?.acted.has(k) ? h("div", { class: "tag" }, "actuó") : null,
    chips.length > 0 ? h("div", { class: "chips" }, ...chips) : null,
  );
}

function battlefield(f: Fight, marks: TurnMarks | null): HTMLElement {
  const row = (side: SideId, a: number, b: number): HTMLElement => h("div", { class: "frow" }, fighterCard(f, side, a, marks), fighterCard(f, side, b, marks));
  return h("div", { class: "field" }, h("div", { class: "side" }, "Rival"), row("B", 3, 4), row("B", 1, 2), h("div", { class: "vs" }, "— frente —"), row("A", 1, 2), row("A", 3, 4), h("div", { class: "side" }, "Tu equipo"));
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
  return h("div", { class: "top" }, h("h1", null, "Proyecto Genoma · Combate"), h("div", { class: "score" }, `Partidas: ${score.played} · Ganadas: ${score.won}`));
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
  fight = startFight(mine, rollRival(seed), seed);
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
    h("p", { class: "sel" }, `Delantera: ${front.map(name).join(", ") || "—"} · Trasera: ${back.map(name).join(", ") || "—"}`, hint ? h("span", { class: "warn" }, " " + hint) : null),
    h("div", { class: "grid" }, ...offer.map((_, i) => soulCard(i))),
    h("p", { class: "seed" }, `semilla de las almas: ${offerSeed}`),
  );
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ planificación del turno
function beginPlanning(): void {
  const f = fight as Fight;
  picks = [1, 2, 3, 4].map(() => ({ move: 0, target: validTargetPositions(null, alive(f.state, "B"), cfg.combat)[0] ?? 1 }));
  report = null;
  phase = "plan";
  render();
  window.scrollTo(0, 0);
}

function targetsFor(f: Fight, m: Move | null): { side: SideId; valid: number[] } {
  const side: SideId = m && m.target === "aliado" ? "A" : "B";
  return { side, valid: validTargetPositions(m, alive(f.state, side), cfg.combat) };
}

function costOf(f: Fight, pos: number, move: number): number {
  const m = move === 0 ? null : (f.state.teams[0][pos - 1] as BattleState["teams"][0][0]).moves[move - 1];
  return m ? m.cost : cfg.combat.damage.basicCost;
}

function selectMove(pos: number, move: number): void {
  const f = fight as Fight;
  const p = picks[pos - 1] as Pick;
  p.move = move;
  const m = move === 0 ? null : (f.state.teams[0][pos - 1] as BattleState["teams"][0][0]).moves[move - 1] ?? null;
  const t = targetsFor(f, m);
  if (!t.valid.includes(p.target)) p.target = t.valid[0] ?? 1;
  render();
}

function orderBlock(f: Fight, pos: number, spentOthers: number): HTMLElement {
  const soul = f.mine[pos - 1] as Soul;
  const fs = f.state.fighters[0][pos - 1] as BattleState["fighters"][0][0];
  const head = h("div", { class: "fhead" }, soulShape(soul.combatant.family, 48), h("div", { class: "fname" }, h("b", null, soul.name), h("small", null, `${familyLabel(soul.combatant.family)} · ${rowName(pos)}`)));
  if (fs.ko) return h("div", { class: "order off" }, head, h("div", { class: "mdesc" }, "KO"));
  if (!eligibleActors(f.state, "A").includes(pos)) return h("div", { class: "order off" }, head, h("div", { class: "mdesc" }, "Aturdida: pierde este turno."));
  const p = picks[pos - 1] as Pick;
  const avail = f.state.energy[0] - spentOthers;
  const opts: HTMLElement[] = [0, 1, 2, 3, 4].map((mi) => {
    const m = mi === 0 ? null : soul.combatant.moves[mi - 1];
    const cost = m ? m.cost : cfg.combat.damage.basicCost;
    const label = m ? m.name : "Golpe básico";
    const d = m ? describeMove(m, cfg.moves) : "";
    return h(
      "button",
      { class: "opt" + (p.move === mi ? " on" : ""), disabled: cost > avail, onclick: () => selectMove(pos, mi) },
      h("span", { class: "oname" }, label, h("span", { class: "cost" }, cost === 0 ? " gratis" : ` ${cost}⚡`)),
      h("span", { class: "mdesc" }, m ? d.slice(d.indexOf("): ") + 3) : `${cfg.combat.damage.basicPower} de daño (x ataque) a un enemigo`),
    );
  });
  const mv = p.move === 0 ? null : soul.combatant.moves[p.move - 1] ?? null;
  const t = targetsFor(f, mv);
  const tnames = (t.side === "A" ? f.mine : f.rival).map((s) => s.name);
  const chips = t.valid.map((tp) =>
    h("button", { class: "tgt" + (p.target === tp ? " on" : ""), onclick: () => ((p.target = tp), render()) }, tnames[tp - 1] ?? `#${tp}`, h("small", null, ` ${rowName(tp)[0]}`)),
  );
  return h("div", { class: "order" }, head, h("div", { class: "opts" }, ...opts), h("div", { class: "tgts" }, h("span", { class: "lbl" }, mv && mv.area ? "Fila de:" : t.side === "A" ? "Aliado:" : "Objetivo:"), ...chips));
}

function currentPlan(f: Fight): { plan: Action[]; cost: number } {
  const plan: Action[] = eligibleActors(f.state, "A").map((pos) => {
    const p = picks[pos - 1] as Pick;
    return { actor: pos, move: p.move, target: p.target };
  });
  return { plan, cost: plan.reduce((a, x) => a + costOf(f, x.actor, x.move), 0) };
}

function renderPlan(): void {
  const f = fight as Fight;
  const { cost } = currentPlan(f);
  const orders = [1, 2, 3, 4].map((pos) => {
    const spentOthers = eligibleActors(f.state, "A")
      .filter((q) => q !== pos)
      .reduce((a, q) => a + costOf(f, q, (picks[q - 1] as Pick).move), 0);
    return orderBlock(f, pos, spentOthers);
  });
  app.replaceChildren(
    topBar(),
    h("div", { class: "turnbar" }, h("b", null, `Turno ${f.state.turn}/${cfg.combat.maxTurns}`), h("span", { class: "foeE" }, `Energía rival: ${f.state.energy[1]}`)),
    energyBar(f.state.energy[0], cost),
    battlefield(f, null),
    h("h2", null, "Tus órdenes"),
    ...orders,
    h("div", { class: "actions sticky" }, h("button", { class: "btn primary big", onclick: () => confirmTurn() }, "Confirmar turno")),
    helpBox(),
    h("p", { class: "seed" }, `semilla de las almas: ${offerSeed} · semilla del combate: ${f.seed}`),
  );
}

function confirmTurn(): void {
  const f = fight as Fight;
  const { plan } = currentPlan(f);
  const { before, events } = playTurn(f, plan);
  report = narrate(before, events, f.names);
  if (f.state.result !== null) {
    score.played++;
    if (f.state.result === "A") score.won++;
    saveScore();
  }
  phase = "report";
  render();
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ informe del turno y fin de partida
function lineNode(l: LogLine): HTMLElement {
  return h("div", { class: "ln " + l.kind }, ...l.parts.map(partNode));
}

function sameTeamAgain(): void {
  const f = fight as Fight;
  const seed = newSeed();
  fight = startFight(f.mine, rollRival(seed), seed);
  beginPlanning();
}
function newTeam(): void {
  phase = "team";
  newOffer();
  window.scrollTo(0, 0);
}

function renderReport(): void {
  const f = fight as Fight;
  const r = report as { lines: LogLine[]; marks: TurnMarks };
  const res = f.state.result;
  const end = res === null ? null : h(
    "div",
    { class: "endbox " + (res === "A" ? "win" : res === "B" ? "lose" : "draw") },
    h("h2", null, res === "A" ? "¡Victoria!" : res === "B" ? "Derrota" : "Empate"),
    h("p", null, `Turnos jugados: ${f.state.turn}. Partidas: ${score.played} · ganadas: ${score.won}.`),
    h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => sameTeamAgain() }, "Otra partida (mismo equipo)"), h("button", { class: "btn", onclick: () => newTeam() }, "Otra partida (equipo nuevo)")),
  );
  app.replaceChildren(
    topBar(),
    h("div", { class: "turnbar" }, h("b", null, `Resultado del turno ${res === null ? f.state.turn - 1 : f.state.turn}`)),
    battlefield(f, r.marks),
    h("div", { class: "log" }, ...r.lines.map(lineNode)),
    end ?? "",
    res === null ? h("div", { class: "actions sticky" }, h("button", { class: "btn primary big", onclick: () => beginPlanning() }, "Siguiente turno")) : "",
    h("p", { class: "seed" }, `semilla de las almas: ${offerSeed} · semilla del combate: ${f.seed}`),
  );
}

function render(): void {
  if (phase === "team") renderTeam();
  else if (phase === "plan") renderPlan();
  else renderReport();
}

render();
