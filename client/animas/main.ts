/** Juego de ánimas (Fase 2, paso 1): santuario, zonas, combate, atrapar, colección, resonancia, variantes y guardado.
 *  UI sin framework: `h()` + re-render completo de `#app` en cada cambio. El combate lo pinta `battle.ts` (la escena del combate v0.5). */
import {
  GameRuleError,
  SaveError,
  animaLevel,
  animaPendingVariants,
  applyBattleResult,
  canResonate,
  catchBlocker,
  catchChance,
  chooseStarter,
  chooseVariant,
  combatantAtLevel,
  companionCombatant,
  companionCreature,
  companionJoins,
  creatureQuality,
  defaultName,
  describeMove,
  describeMoveShort,
  encounterBattleRng,
  encounterSides,
  findAnima,
  generateMoveForKey,
  geneKey,
  isMature,
  markIntroSeen,
  newGame,
  parseSave,
  placementShape,
  qualityPercent,
  release,
  releaseBlocker,
  releaseEssence,
  rename,
  resonanceCost,
  resonanceOdds,
  resonate,
  rollEncounter,
  serialize,
  setTeam,
  slotMove,
  starterOptions,
  startEncounterBattle,
  throwLantern,
  toggleVariant,
  validatePlacement,
  wildAi,
  xpForLevel,
  zoneUnlocked,
  LOCUS_IDS,
  type Anima,
  type BattleReport,
  type BattleState,
  type Creature,
  type Encounter,
  type GameState,
  type LocusId,
  type Move,
  type ResonanceResult,
  type ThrowResult,
  type VariantCandidate,
} from "../../packages/core/src/index.ts";
import { cfg, familyLabel, gcfg, palette, soulName } from "../combat/data.ts";
import { SOUL_CSS, soulSvg } from "../art/soul.ts";
import type { Soul } from "../combat/game.ts";
import { h, runBattle, stopBattle, type Kid } from "./battle.ts";
import { ARNAL, COMPANION_NAME, ESSENCE_NOTE, HITO, ZONE_BLURB, pcfg } from "./data.ts";

// ------------------------------------------------------------------ utilidades
const app = document.getElementById("app") as HTMLElement;
const svgNS = "http://www.w3.org/2000/svg";
if (!document.getElementById("soul3-css")) {
  const st = document.createElement("style");
  st.id = "soul3-css";
  st.textContent = SOUL_CSS;
  document.head.append(st);
}

/** Dibujo del ánima (arte v3 desde sus genes). SVG generado por nuestro código, nunca texto del usuario. */
function art(c: Creature, size: number, mood: "idle" | "ko" = "idle"): SVGElement {
  const tpl = document.createElementNS(svgNS, "g");
  tpl.innerHTML = soulSvg(c, gcfg, { size, mood, className: "soul" });
  return tpl.firstElementChild as SVGElement;
}

/** Semilla de la partida: crypto (el azar de las reglas sale luego de `createRng`). */
function newSeed(): string {
  try {
    const a = new Uint32Array(3);
    crypto.getRandomValues(a);
    return Array.from(a, (x) => x.toString(36)).join("");
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

const dots = (n: number, max: number): string => "●".repeat(Math.min(n, max)) + "○".repeat(Math.max(0, max - n));
const pct1 = (x: number): string => `${Math.round(x * 100)} %`;
const LOCUS_NAME: Record<LocusId, string> = { cabeza: "Cabeza", cuerpo: "Cuerpo", extremidades: "Extremidades", cola: "Cola" };
const MAX_ECOS = pcfg.genetics.limits.maxOffspring;

// ------------------------------------------------------------------ estado de la aplicación
type Els = (HTMLElement | "" | null)[];
type Screen = "intro" | "starter" | "home" | "zones" | "prefight" | "battle" | "result" | "variants" | "collection" | "sheet" | "resonance" | "echo" | "codex" | "save" | "fatal";
let game: GameState = newGame(newSeed(), pcfg);
let screen: Screen = "intro";
let storageOk = true;
let flash = "";
let fatal = "";
let introStep = 0;
let starterPick: number | null = null;
let draftName = "";
let zoneId: string | null = null;
let enc: Encounter | null = null;
let shapeIdx = 0;
let gameBefore: GameState | null = null;
let lastReport: BattleReport | null = null;
let throwLog: { text: string; kind: "ok" | "bad" | "info" }[] = [];
let namingId: string | null = null;
let sheetId: string | null = null;
let variantId: string | null = null;
let variantBack: Screen = "home";
let resA: string | null = null;
let resB: string | null = null;
let echoOut: { r: ResonanceResult; newGenes: number; newFamilies: string[]; parents: [string, string] } | null = null;
let importText = "";
let importMsg = "";
let confirmNew = false;
let confirmRelease = false;
let sortBy: "nivel" | "reciente" | "familia" = "nivel";

// ------------------------------------------------------------------ guardado
const KEY = pcfg.save.storageKey;
function persist(): void {
  try {
    localStorage.setItem(KEY, serialize(game));
    storageOk = true;
  } catch {
    storageOk = false; // sin almacenamiento (file://, modo privado): solo en memoria; se puede exportar
  }
}
function loadStored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    storageOk = false;
    return null;
  }
}
/** Cuenta una sesión por pestaña (sessionStorage); sin él, una por carga. */
function countSession(): void {
  let first = true;
  try {
    if (sessionStorage.getItem("genoma.sesion") === "1") first = false;
    else sessionStorage.setItem("genoma.sesion", "1");
  } catch {
    /* cuenta una por carga */
  }
  if (first) game = { ...game, registro: { ...game.registro, sesiones: game.registro.sesiones + 1 } };
}
function boot(): void {
  const raw = loadStored();
  if (raw !== null) {
    try {
      const r = parseSave(raw, pcfg);
      game = r.game;
      if (r.notes.length > 0) flash = r.notes.join(" ");
    } catch (e) {
      fatal = e instanceof SaveError ? e.message : String(e);
      screen = "fatal";
      return;
    }
  }
  countSession();
  persist();
  screen = game.inicial.elegida === null ? "intro" : "home";
  if (screen === "intro" && game.inicial.intro_vista) screen = "starter";
}

// ------------------------------------------------------------------ cálculos de presentación
const animas = (): readonly Anima[] => game.animas;
const lvl = (a: Anima): number => animaLevel(a, pcfg);
const nameOf = (id: string): string => findAnima(game, id)?.nombre ?? game.linaje.find((l) => l.id === id)?.nombre ?? "un ánima liberada";
function topLevel(g: GameState): number {
  return g.animas.reduce((m, a) => Math.max(m, animaLevel(a, pcfg)), g.nivel_max_alcanzado);
}
const pendingOf = (a: Anima): number => animaPendingVariants(game, a.id, pcfg).length;
const totalPending = (): number => animas().reduce((n, a) => n + pendingOf(a), 0);
function slotOf(a: Anima, locus: LocusId): number {
  return a.huecos.findIndex((s) => s !== null && s.fuente === "gen" && s.locus === locus);
}
function originText(a: Anima): string {
  if (a.origen === "inicial") return "Elegida en el santuario";
  if (a.origen === "captura") return `Atrapada en ${pcfg.world.zones.find((z) => z.id === a.lugar)?.name ?? "algún lugar"}`;
  const p = a.criatura.parents;
  return p ? `Eco de ${nameOf(p[0])} y ${nameOf(p[1])}` : "Eco";
}
function pureza(c: Creature): string {
  return `${Math.round(qualityPercent(creatureQuality(c), gcfg))} %`;
}
function sortedAnimas(): Anima[] {
  const arr = animas().slice();
  if (sortBy === "nivel") arr.sort((a, b) => b.xp - a.xp || a.nacimiento - b.nacimiento);
  else if (sortBy === "reciente") arr.sort((a, b) => b.nacimiento - a.nacimiento);
  else arr.sort((a, b) => a.criatura.family.localeCompare(b.criatura.family) || b.xp - a.xp);
  return arr;
}

// ------------------------------------------------------------------ componentes
function chip(family: string): HTMLElement {
  return h("span", { class: "fam", style: `--fam:${palette(family).main}` }, familyLabel(family));
}
function xpBar(a: Anima, compact = false): HTMLElement {
  const L = lvl(a);
  if (L >= pcfg.levels.max) return h("div", { class: "xp" }, h("div", { class: "xpb" }, h("i", { style: "width:100%" })), h("small", null, "Nivel máximo"));
  const lo = xpForLevel(L, pcfg);
  const hi = xpForLevel(L + 1, pcfg);
  return h("div", { class: "xp" }, h("div", { class: "xpb" }, h("i", { style: `width:${Math.round(((a.xp - lo) / (hi - lo)) * 100)}%` })), compact ? null : h("small", null, `${a.xp - lo} / ${hi - lo} XP para el nivel ${L + 1}`));
}
function moveBox(m: Move, tag?: string, extra?: Kid): HTMLElement {
  return h(
    "div",
    { class: "mv" },
    h("div", { class: "mvh" }, h("b", null, m.name), h("span", { class: "cost" }, m.cost === 0 ? "gratis" : `${m.cost}⚡`), tag ? h("span", { class: "atag" }, tag) : null),
    h("div", { class: "mdesc2" }, describeMove(m, pcfg.battle.moves)),
    extra ?? null,
  );
}
function btn(label: string, onclick: () => void, cls = "", dis = false): HTMLElement {
  return h("button", { class: "btn " + cls, disabled: dis, onclick }, label);
}
function go(s: Screen): void {
  screen = s;
  flash = s === "home" ? flash : "";
  render(true);
}
function guard(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    if (e instanceof GameRuleError) {
      flash = e.message;
      render();
    } else throw e;
  }
}
function nameInput(onInput: (v: string) => void): HTMLInputElement {
  const i = h("input", { class: "nm", type: "text", maxlength: pcfg.collection.nameMaxChars, value: draftName, "aria-label": "Nombre" }) as HTMLInputElement;
  i.addEventListener("input", () => onInput(i.value));
  return i;
}
function confirmBox(title: string, text: string, ok: string, onOk: () => void, onNo: () => void): HTMLElement {
  return h("div", { class: "ov" }, h("div", { class: "ovp" }, h("div", { class: "ovh" }, h("b", null, title)), h("p", null, text), h("div", { class: "actions" }, btn("Cancelar", onNo), btn(ok, onOk, "primary"))));
}

function topBar(): HTMLElement {
  const r = game.registro;
  return h(
    "div",
    { class: "atop" },
    h("div", { class: "arow" }, h("h1", null, "Ánimas"), h("span", { class: "res" }, h("span", { title: "Faroles" }, `🏮 ${game.recursos.faroles}`), h("span", { title: "Esencia" }, `✦ ${game.recursos.esencia}`))),
    h("div", { class: "arow sub2" }, h("span", null, `Sesión ${r.sesiones} · ecos ${r.resonancias}`), screen !== "home" ? btn("← Santuario", () => go("home"), "sm") : btn("Guardado", () => go("save"), "sm")),
    storageOk ? null : h("div", { class: "note warn" }, "Este navegador no deja guardar la partida. Usa «Guardado → Exportar» antes de cerrar."),
    flash ? h("div", { class: "note" }, flash) : null,
  );
}

// ------------------------------------------------------------------ 1. inicio: Arnal y las iniciales
function renderIntro(): Els {
  const lines = ARNAL.texto_inicio;
  const last = introStep >= lines.length - 1;
  return [
    h("div", { class: "arnal" }, h("div", { class: "lantern", "aria-hidden": "true" }, "🏮"), h("div", null, h("b", null, ARNAL.nombre), h("small", null, ` · ${ARNAL.titulo}`)), h("div", { class: "speech" }, `«${lines[introStep]}»`)),
    h("div", { class: "dotsrow" }, ...lines.map((_, i) => h("i", { class: i <= introStep ? "on" : "" }))),
    h("div", { class: "actions" }, introStep > 0 ? btn("Atrás", () => ((introStep -= 1), render())) : null, btn(last ? "Elegir mi ánima" : "Siguiente", () => {
      if (last) {
        game = markIntroSeen(game);
        persist();
        go("starter");
      } else {
        introStep += 1;
        render();
      }
    }, "primary grow")),
    h("p", { class: "dim" }, "Recibes 6 faroles y 30 de esencia."),
  ];
}

function renderStarter(): Els {
  const opts = starterOptions(game, pcfg);
  const picked = starterPick !== null ? (opts[starterPick] as Creature) : null;
  const cards = opts.map((c, k) => {
    const cb = combatantAtLevel(c, pcfg.levels.starterLevel, pcfg);
    return h(
      "div",
      { class: "scard2" + (starterPick === k ? " picked" : ""), style: `--fam:${palette(c.family).main}`, role: "button", tabindex: 0, "data-starter": k, onclick: () => {
        starterPick = k;
        draftName = defaultName(game, game.contadores.nacimientos + 1, pcfg);
        render();
      } },
      h("div", { class: "fhead" }, art(c, 84), h("div", { class: "fname" }, chip(c.family), h("small", null, `Pureza ${pureza(c)}`))),
      h("ul", { class: "moves" }, ...cb.moves.map((m) => h("li", null, h("b", null, m.name), h("span", { class: "cost" }, m.cost === 0 ? " gratis" : ` ${m.cost}⚡`), h("div", { class: "mdesc" }, describeMoveShort(m, cfg.moves))))),
    );
  });
  return [
    h("p", { class: "intro" }, h("b", null, ARNAL.nombre), ": «Elige una. No hay mala elección, solo malas costumbres.»"),
    h("div", { class: "grid2" }, ...cards),
    picked
      ? h("div", { class: "namebox" }, h("label", null, "Ponle nombre"), nameInput((v) => (draftName = v)), btn("Quedármela", () => guard(() => {
        game = chooseStarter(game, starterPick as number, pcfg, draftName);
        game = markIntroSeen(game);
        persist();
        flash = "Ya tienes tu primera ánima. Sal a explorar el Prado de la Linde.";
        go("home");
      }), "primary"))
      : h("p", { class: "dim" }, "Toca una para verla de cerca y ponerle nombre."),
  ];
}

// ------------------------------------------------------------------ 2. santuario
const ARNAL_QUIPS = [
  "Si se apaga una, no llores: vuelve al farol. Lo que sí duele es perder el combate.",
  "Las ánimas maduras resuenan mejor. Las impacientes, mal.",
  "Mira los genes antes de lanzar el farol. Después ya es tarde para arrepentirse.",
  "Una variante para siempre... salvo que me pidas el original. No me lo tomo a mal.",
];
function renderHome(): Els {
  const r = game.registro;
  const top = topLevel(game);
  const ok = (b: boolean): string => (b ? "✔" : "·");
  const team = game.equipo.map((id) => findAnima(game, id)).filter((a): a is Anima => a !== undefined);
  const pend = totalPending();
  const eligible = animas().filter((a) => isMature(lvl(a), pcfg) && a.criatura.offspringCount < MAX_ECOS).length;
  return [
    h("div", { class: "hito" }, h("b", null, "Progreso de la prueba (hito D-066)"), h("div", { class: "hrow" }, h("span", null, `${ok(r.sesiones >= HITO.sesiones)} Sesiones ${r.sesiones}/${HITO.sesiones}`), h("span", null, `${ok(r.resonancias >= HITO.resonancias)} Resonancias ${r.resonancias}/${HITO.resonancias}`), h("span", null, `${ok(top >= HITO.nivelAlto)} Mejor nivel ${top} (≈${HITO.nivelAlto})`)), h("small", null, `Combates ${r.combates} · victorias ${r.victorias} · capturas ${r.capturas}/${r.intentos} intentos`)),
    h("div", { class: "arnal sm" }, h("div", { class: "lantern", "aria-hidden": "true" }, "🏮"), h("div", { class: "speech" }, `«${ARNAL_QUIPS[r.combates % ARNAL_QUIPS.length]}»`)),
    pend > 0 ? h("div", { class: "note ok" }, `${pend === 1 ? "Una ánima tiene" : `${pend} elecciones de variante pendientes:`} una variante por elegir. `, btn("Elegir", () => {
      const a = animas().find((x) => pendingOf(x) > 0) as Anima;
      variantId = a.id;
      variantBack = "home";
      go("variants");
    }, "sm primary")) : null,
    h("h2", null, "Tu equipo"),
    h("div", { class: "teamstrip" }, ...team.map((a) => h("div", { class: "tchip", style: `--fam:${palette(a.criatura.family).main}`, onclick: () => ((sheetId = a.id), go("sheet")) }, art(a.criatura, 44), h("span", null, h("b", null, a.nombre), h("small", null, `Nivel ${lvl(a)}`))))),
    h("div", { class: "menu" },
      btn("Salir a explorar", () => go("zones"), "primary big"),
      btn(`Resonar${eligible >= 2 ? "" : " (hacen falta 2 maduras)"}`, () => ((resA = null), (resB = null), go("resonance")), "big"),
      btn(`Colección (${animas().length})`, () => go("collection"), "big"),
      btn(`Codex (${game.codex.genes.length} genes)`, () => go("codex"), "big"),
    ),
    h("p", { class: "dim" }, ESSENCE_NOTE),
  ];
}

// ------------------------------------------------------------------ 3. zonas y encuentro
function groupText(w: readonly number[]): string {
  return w.map((p, i) => (p > 0 ? `${i + 1} ánima${i ? "s" : ""} (${Math.round(p * 100)} %)` : "")).filter(Boolean).join(" · ");
}
function renderZones(): Els {
  return [
    h("h2", null, "Salir a explorar"),
    h("p", { class: "intro" }, "Cada encuentro es un combate de tu equipo contra un grupo salvaje. Si ganas, puedes lanzar faroles para atraparlas."),
    ...pcfg.world.zones.map((z) => {
      const open = zoneUnlocked(game, z.id, pcfg);
      return h(
        "div",
        { class: "zone" + (open ? "" : " locked"), "data-zone": z.id },
        h("div", { class: "zh" }, h("b", null, z.name), h("span", { class: "lv" }, `nivel ${z.minLevel}–${z.maxLevel}`)),
        h("p", { class: "dim" }, ZONE_BLURB[z.id] ?? ""),
        h("div", { class: "fams" }, ...z.families.map((f) => chip(f))),
        h("small", null, `Grupos: ${groupText(z.groupWeights)}`),
        open ? btn("Entrar", () => startEncounter(z.id), "primary") : h("div", { class: "lockmsg" }, `🔒 Se abre cuando un ánima tuya llegue a nivel ${z.unlockLevel}.`),
      );
    }),
    btn("Volver al santuario", () => go("home")),
  ];
}
function startEncounter(zid: string): void {
  guard(() => {
    const r = rollEncounter(game, zid, pcfg);
    game = r.game;
    enc = r.encounter;
    zoneId = zid;
    persist(); // el contador del encuentro ya está gastado: recargar no repite ni deja elegir
    go("prefight");
  });
}

function placements(n: number): { label: string; place: number[] }[] {
  const cand: Record<number, number[][]> = { 1: [[1]], 2: [[1, 2], [1, 3]], 3: [[1, 2, 3], [1, 3, 4]] };
  return (cand[n] ?? []).filter((p) => validatePlacement(p, pcfg.battle.combat, n, pcfg.battle.sides) === null).map((p) => {
    const s = placementShape(p, pcfg.battle.combat);
    const [d, t] = s.split("+").map(Number) as [number, number];
    return { label: n === 1 ? "En solitario" : `${d} delante${t ? ` + ${t} detrás` : ""}`, place: p };
  });
}
function wildSoulNames(e: Encounter): string[] {
  const taken = new Set<string>();
  return e.wilds.map((w) => soulName(w.creature.id, game.semilla, taken));
}
function refreshEnc(): Encounter {
  const e = enc as Encounter;
  enc = { ...e, team: game.equipo.slice(), companion: companionJoins(game, pcfg) };
  return enc;
}
function renderPrefight(): Els {
  const e = refreshEnc();
  const z = pcfg.world.zones.find((x) => x.id === e.zone) as { name: string };
  const names = wildSoulNames(e);
  const team = e.team.map((id) => findAnima(game, id) as Anima);
  const n = team.length + (e.companion ? 1 : 0);
  const opts = placements(n);
  if (shapeIdx >= opts.length) shapeIdx = 0;
  const mv = (i: number, d: -1 | 1): void => {
    const ids = game.equipo.slice();
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
    guard(() => {
      game = setTeam(game, ids, pcfg);
      persist();
      render();
    });
  };
  return [
    h("h2", null, z.name),
    h("p", { class: "intro" }, `Aparece un grupo de ${e.wilds.length} salvaje${e.wilds.length > 1 ? "s" : ""}.`),
    h("div", { class: "wilds" }, ...e.wilds.map((w, i) => h("div", { class: "wcard", style: `--fam:${palette(w.creature.family).main}` }, art(w.creature, 64), h("div", null, h("b", null, names[i]), h("small", null, `${familyLabel(w.creature.family)} · nivel ${w.level}`))))),
    h("h2", null, "Tu equipo"),
    e.companion ? h("p", { class: "dim" }, `${COMPANION_NAME} lucha contigo mientras tengas menos de ${pcfg.world.companion.whileFewerThan} ánimas. No gana experiencia.`) : null,
    h("div", { class: "teamlist" }, ...team.map((a, i) => h("div", { class: "trow", style: `--fam:${palette(a.criatura.family).main}` }, art(a.criatura, 40), h("span", { class: "tn" }, h("b", null, a.nombre), h("small", null, `${familyLabel(a.criatura.family)} · nivel ${lvl(a)}`)), h("span", { class: "ord2" }, i > 0 ? btn("◀", () => mv(i, -1), "sm") : null, i < team.length - 1 ? btn("▶", () => mv(i, 1), "sm") : null)))),
    animas().length > 1 ? btn("Cambiar equipo", () => go("collection"), "sm") : null,
    opts.length > 1 ? h("div", { class: "diff" }, h("span", { class: "lbl" }, "Formación"), ...opts.map((o, i) => h("button", { class: "btn" + (i === shapeIdx ? " on" : ""), onclick: () => ((shapeIdx = i), render()) }, o.label))) : null,
    h("div", { class: "actions" }, btn("Huir", () => {
      const r = applyBattleResult(game, e, "huida", pcfg);
      game = r.game;
      enc = null;
      persist();
      go("zones");
    }), btn("¡Combatir!", () => startBattle((opts[shapeIdx] as { place: number[] }).place), "primary grow")),
  ];
}

// ------------------------------------------------------------------ 4. combate
function startBattle(place: number[]): void {
  const e = refreshEnc();
  const state0 = startEncounterBattle(game, e, pcfg, place);
  const names = wildSoulNames(e);
  const byId = new Map<string, Soul>();
  for (const id of e.team) {
    const a = findAnima(game, id) as Anima;
    byId.set(id, { creature: a.criatura, combatant: state0.teams[0].find((c) => c?.id === id) as Soul["combatant"], name: a.nombre });
  }
  if (e.companion) byId.set("acompanante", { creature: companionCreature(pcfg), combatant: companionCombatant(pcfg), name: COMPANION_NAME });
  e.wilds.forEach((w, i) => byId.set(w.creature.id, { creature: w.creature, combatant: combatantAtLevel(w.creature, w.level, pcfg), name: names[i] as string }));
  const bySlot = (side: 0 | 1): (Soul | null)[] => state0.teams[side].map((c) => (c ? (byId.get(c.id) ?? null) : null));
  gameBefore = game;
  throwLog = [];
  namingId = null;
  screen = "battle";
  runBattle({
    app,
    state: state0,
    rng: encounterBattleRng(game, e),
    ai: wildAi(pcfg),
    mine: bySlot(0),
    rival: bySlot(1),
    label: `${zoneId ?? ""} · encuentro ${e.n + 1} · semilla ${game.semilla}`,
    onEnd: (final: BattleState) => finishBattle(final),
    onDone: () => {
      stopBattle();
      go("result");
    },
    onFlee: () => {
      stopBattle();
      const r = applyBattleResult(game, e, "huida", pcfg);
      game = r.game;
      enc = null;
      persist();
      go("zones");
    },
  });
}
/** Aplica el resultado (sin azar) y guarda antes de enseñar nada. */
function finishBattle(final: BattleState): void {
  const r = applyBattleResult(game, enc as Encounter, final, pcfg);
  game = r.game;
  enc = r.encounter;
  lastReport = r.report;
  persist();
}

// ------------------------------------------------------------------ 5. resultado y atrapar
function learnedText(a: Anima, locus: LocusId): string {
  const k = slotOf(a, locus);
  const m = k >= 0 ? slotMove(a, a.huecos[k] ?? null, pcfg) : null;
  return `Aprende ${m ? m.name : LOCUS_NAME[locus].toLowerCase()}`;
}
function throwAt(i: number): void {
  guard(() => {
    const e = enc as Encounter;
    const r: ThrowResult = throwLantern(game, e, i, pcfg);
    game = r.game;
    enc = r.encounter;
    persist(); // antes de enseñar el resultado: recargar no da otra tirada
    const names = wildSoulNames(e);
    if (r.caught && r.anima) {
      throwLog.push({ text: `¡Atrapada! (${r.pct} %, tirada ${r.roll}) ${names[i]} se une a tu colección${game.equipo.includes(r.anima.id) ? " y a tu equipo" : ""}.`, kind: "ok" });
      namingId = r.anima.id;
      draftName = r.anima.nombre;
    } else if (r.escaped) throwLog.push({ text: `Se ha escapado (${r.pct} %, tirada ${r.roll}). ${names[i]} se pierde en la niebla.`, kind: "bad" });
    else throwLog.push({ text: `El farol falla (${r.pct} %, tirada ${r.roll}). Aún puedes reintentarlo con más suerte (+${pcfg.catching.retryBonusPct} %).`, kind: "bad" });
    render();
  });
}
function renderResult(): Els {
  const e = enc as Encounter;
  const rp = lastReport as BattleReport;
  const before = gameBefore as GameState;
  const names = wildSoulNames(e);
  const win = rp.outcome === "victoria";
  const out: HTMLElement[] = [h("div", { class: "endbox " + (win ? "win" : "lose") }, h("h2", null, win ? "¡Victoria!" : "Derrota"), h("p", null, win ? `Tu equipo gana ${rp.xpEach} XP cada una, ${rp.essence} de esencia y ${rp.lanterns} farol.` : rp.xpEach > 0 ? `Pierdes, pero se aprende: ${rp.xpEach} XP cada una. Sin esencia ni faroles.` : "Pierdes. No es la peor forma de aprender, solo la más cara."))];
  // progreso por ánima
  for (const p of rp.progress) {
    const a = findAnima(game, p.id);
    if (!a) continue;
    const notes: string[] = [];
    if (p.levelAfter > p.levelBefore) notes.push(`¡Sube a nivel ${p.levelAfter}!`);
    for (const L of p.newSlots) notes.push(learnedText(a, L));
    if (p.matured) notes.push("Ha madurado: ya puede resonar.");
    for (const pos of p.revealed) {
      const [locus, slot] = pos.split(".") as [LocusId, "R1" | "R2"];
      notes.push(`Revela un gen oculto (${LOCUS_NAME[locus].toLowerCase()}): ${familyLabel(a.criatura.genome[locus][slot].family)}.`);
    }
    out.push(h("div", { class: "prog", style: `--fam:${palette(a.criatura.family).main}` }, art(a.criatura, 44), h("div", { class: "pgi" }, h("b", null, a.nombre), h("small", null, ` nivel ${p.levelAfter} · +${p.xpGained} XP`), xpBar(a, true), ...notes.map((t) => h("div", { class: "pn2" }, t)), p.variantLevels.length > 0 ? btn("Elegir variante", () => ((variantId = a.id), (variantBack = "result"), go("variants")), "sm primary") : null)));
  }
  const opened = pcfg.world.zones.filter((z) => !zoneUnlocked(before, z.id, pcfg) && zoneUnlocked(game, z.id, pcfg));
  for (const z of opened) out.push(h("div", { class: "note ok" }, `Se abre una zona nueva: ${z.name}.`));
  // atrapar
  if (win) {
    out.push(h("h2", null, "Atrapar"), h("p", { class: "dim" }, `Faroles: ${game.recursos.faroles}. El porcentaje sale de la vida que le queda a tu equipo, el nivel y la pureza de la salvaje. Cada una admite ${pcfg.catching.maxAttempts} intentos.`));
    e.wilds.forEach((w, i) => {
      const chance = catchChance(game, e, i, pcfg);
      const why = catchBlocker(game, e, i, pcfg);
      const c = w.creature;
      out.push(h(
        "div",
        { class: "wcard big", style: `--fam:${palette(c.family).main}`, "data-wild": i },
        art(c, 72),
        h("div", { class: "wi" },
          h("b", null, names[i]),
          h("small", null, `${familyLabel(c.family)} · nivel ${w.level} · pureza ${pureza(c)}`),
          h("div", { class: "gdots" }, ...LOCUS_IDS.map((L) => h("span", { class: "gd", title: LOCUS_NAME[L] }, `${LOCUS_NAME[L].slice(0, 3)}: ${familyLabel(c.genome[L].D.family)}`))),
          w.state === "atrapada" ? h("div", { class: "st ok" }, "Atrapada") : w.state === "escapada" ? h("div", { class: "st bad" }, "Escapada") : chance !== null
            ? h("div", { class: "throw" }, h("span", { class: "pctb" }, `${chance} %`, w.attempts > 0 ? h("small", null, " (reintento)") : null), btn(`Lanzar farol (quedan ${game.recursos.faroles})`, () => throwAt(i), "primary", false))
            : h("div", { class: "st dim" }, why ?? "")),
      ));
    });
    for (const l of throwLog) out.push(h("div", { class: "note " + l.kind }, l.text));
    if (namingId !== null && findAnima(game, namingId)) {
      const id = namingId;
      out.push(h("div", { class: "namebox" }, h("label", null, "Nombre de la nueva ánima"), nameInput((v) => (draftName = v)), btn("Guardar nombre", () => guard(() => {
        game = rename(game, id, draftName, pcfg);
        persist();
        namingId = null;
        throwLog.push({ text: `Ahora se llama ${draftName.trim()}.`, kind: "info" });
        render();
      }), "primary")));
    }
  }
  out.push(h("div", { class: "actions" }, btn("Otro encuentro aquí", () => { if (zoneId) startEncounter(zoneId); }, "primary grow"), btn("Mapa", () => go("zones")), btn("Santuario", () => go("home"))));
  return out;
}

// ------------------------------------------------------------------ 6. colección y ficha
function teamToggle(a: Anima): void {
  guard(() => {
    const ids = game.equipo.slice();
    const k = ids.indexOf(a.id);
    if (k >= 0) {
      if (ids.length <= pcfg.collection.teamMin) throw new GameRuleError("El equipo necesita al menos 1 ánima.");
      ids.splice(k, 1);
    } else {
      if (ids.length >= pcfg.collection.teamMax) throw new GameRuleError(`El equipo ya tiene ${pcfg.collection.teamMax} ánimas: quita una antes.`);
      ids.push(a.id);
    }
    game = setTeam(game, ids, pcfg);
    persist();
    render();
  });
}
function renderCollection(): Els {
  const back = enc !== null && enc.outcome === null && zoneId !== null;
  return [
    h("h2", null, `Colección (${animas().length}/${pcfg.collection.max})`),
    h("p", { class: "intro" }, `Equipo de ${pcfg.collection.teamMin} a ${pcfg.collection.teamMax} (${game.equipo.length} ahora). Toca el nombre para ver la ficha.`),
    h("div", { class: "diff" }, h("span", { class: "lbl" }, "Orden"), ...(["nivel", "reciente", "familia"] as const).map((s) => h("button", { class: "btn sm" + (sortBy === s ? " on" : ""), onclick: () => ((sortBy = s), render()) }, s[0]?.toUpperCase() + s.slice(1)))),
    h("div", { class: "clist" }, ...sortedAnimas().map((a) => {
      const inTeam = game.equipo.indexOf(a.id);
      return h(
        "div",
        { class: "crow" + (inTeam >= 0 ? " inteam" : ""), style: `--fam:${palette(a.criatura.family).main}`, "data-anima": a.id },
        h("div", { class: "cmain", onclick: () => ((sheetId = a.id), go("sheet")) }, art(a.criatura, 48), h("div", { class: "ci" }, h("b", null, a.nombre), h("small", null, `${familyLabel(a.criatura.family)} · nivel ${lvl(a)}${isMature(lvl(a), pcfg) ? "" : " · inmadura"}`), xpBar(a, true), h("small", { class: "dim" }, `Pureza ${pureza(a.criatura)} · ecos ${dots(a.criatura.offspringCount, MAX_ECOS)}${pendingOf(a) > 0 ? " · variante pendiente" : ""}`))),
        btn(inTeam >= 0 ? `Equipo ${inTeam + 1} ✔` : "Al equipo", () => teamToggle(a), "sm" + (inTeam >= 0 ? " on" : "")),
      );
    })),
    h("div", { class: "actions" }, back ? btn("Volver al encuentro", () => go("prefight"), "primary grow") : null, btn("Santuario", () => go("home"))),
  ];
}

function geneCell(c: Creature, locus: LocusId, slot: "D" | "R1" | "R2", shown: boolean): HTMLElement {
  if (!shown) return h("div", { class: "gcell hid" }, h("small", null, slot), h("b", null, "?"));
  const g = c.genome[locus][slot];
  return h("div", { class: "gcell", style: `--fam:${palette(g.family).main}` }, h("small", null, slot), h("b", null, familyLabel(g.family)), h("span", { class: "mvn" }, generateMoveForKey(geneKey(g), pcfg.battle.moves).name));
}
function renderSheet(): Els {
  const a = findAnima(game, sheetId ?? "");
  if (!a) return [h("p", null, "Esa ánima ya no está."), btn("Colección", () => go("collection"))];
  const L = lvl(a);
  const c = a.criatura;
  const eco = c.offspringCount;
  const blocker = releaseBlocker(game, a.id, pcfg);
  const essence = releaseEssence(a, pcfg);
  const parents = c.parents;
  const moves = a.huecos.map((s, k) => {
    if (s === null) {
      const rule = pcfg.unlocks.paidSlots[k - 1];
      return h("div", { class: "mv locked" }, h("b", null, "Bloqueado"), h("span", { class: "atag" }, `nivel ${rule ? rule.level : "?"}`));
    }
    const m = slotMove(a, s, pcfg) as Move;
    const hasVar = s.fuente === "gen" && a.variantes[s.locus] !== undefined;
    const on = s.fuente === "gen" && s.variante;
    return moveBox(m, on ? "variante" : hasVar ? "original" : undefined, hasVar ? btn(on ? "Volver al original" : "Usar la variante", () => guard(() => ((game = toggleVariant(game, a.id, k, pcfg)), persist(), render())), "sm") : null);
  });
  const pend = animaPendingVariants(game, a.id, pcfg);
  return [
    h("div", { class: "sheet", style: `--fam:${palette(c.family).main}` },
      h("div", { class: "shead" }, art(c, 120), h("div", null, chip(c.family), h("div", { class: "big2" }, a.nombre), h("small", null, `Nivel ${L} · ${isMature(L, pcfg) ? "madura" : `madura al nivel ${pcfg.unlocks.matureLevel}`}`), xpBar(a), h("small", { class: "dim" }, `Pureza ${pureza(c)} · Ecos ${dots(eco, MAX_ECOS)}`), h("small", { class: "dim" }, originText(a)))),
      h("div", { class: "namebox" }, h("label", null, "Renombrar"), (() => { draftName = a.nombre; return nameInput((v) => (draftName = v)); })(), btn("Guardar", () => guard(() => ((game = rename(game, a.id, draftName, pcfg)), persist(), (flash = "Nombre guardado."), render()))))),
    pend.length > 0 ? h("div", { class: "note ok" }, `Variante pendiente (nivel ${pend.map((o) => o.level).join(", ")}). `, btn("Elegir", () => ((variantId = a.id), (variantBack = "sheet"), go("variants")), "sm primary")) : null,
    h("h2", null, "Movimientos"),
    ...moves,
    h("h2", null, "Genes"),
    h("p", { class: "dim" }, "D es el que se expresa; R1 y R2 son ocultos y se revelan al subir de nivel o al heredarlos."),
    h("div", { class: "genes" }, ...LOCUS_IDS.map((Lc) => h("div", { class: "grow2" }, h("div", { class: "gl" }, LOCUS_NAME[Lc]), geneCell(c, Lc, "D", true), geneCell(c, Lc, "R1", a.revelados.includes(`${Lc}.R1`)), geneCell(c, Lc, "R2", a.revelados.includes(`${Lc}.R2`))))),
    parents ? h("p", { class: "dim" }, `Padres: ${nameOf(parents[0])} y ${nameOf(parents[1])}.`) : null,
    h("div", { class: "actions" }, btn(game.equipo.includes(a.id) ? "Quitar del equipo" : "Añadir al equipo", () => teamToggle(a)), btn("Liberar", () => ((confirmRelease = true), render()), "", blocker !== null)),
    blocker ? h("small", { class: "dim" }, `No se puede liberar: ${blocker}.`) : null,
    btn("← Colección", () => go("collection")),
    confirmRelease ? confirmBox(`Liberar a ${a.nombre}`, essence > 0 ? `Es irreversible. Te da ${essence} de esencia.` : "Es irreversible. Por debajo del nivel de maduración no da esencia.", "Liberar", () => guard(() => {
      const r = release(game, a.id, pcfg);
      game = r.game;
      persist();
      confirmRelease = false;
      flash = `${a.nombre} se ha ido${r.essence > 0 ? `: +${r.essence} de esencia` : ""}.`;
      go("collection");
    }), () => ((confirmRelease = false), render())) : "",
  ];
}

// ------------------------------------------------------------------ 7. codex
function renderCodex(): Els {
  const seen = new Set(game.codex.genes);
  const base = gcfg.catalog.filter((g) => seen.has(geneKey(g))).length;
  const fams = [...gcfg.baseFamilies, ...gcfg.hybrids.map((x) => x.id)];
  const body: HTMLElement[] = [h("h2", null, `Codex · ${base}/${gcfg.catalog.length} genes del catálogo`), h("p", { class: "dim" }, "Un gen entra aquí cuando lo ves como D en un ánima tuya o se revela como oculto."), h("div", { class: "fams" }, ...fams.map((f) => h("span", { class: "fam" + (game.codex.familias.includes(f) ? "" : " off"), style: `--fam:${palette(f).main}` }, game.codex.familias.includes(f) ? familyLabel(f) : "?")))];
  for (const f of gcfg.baseFamilies) {
    const cells = LOCUS_IDS.map((Lc) => h("div", { class: "cxcol" }, h("div", { class: "gl" }, LOCUS_NAME[Lc]), ...gcfg.catalog.filter((g) => g.family === f && g.locus === Lc).map((g) => seen.has(geneKey(g)) ? h("div", { class: "cxc on" }, generateMoveForKey(geneKey(g), pcfg.battle.moves).name) : h("div", { class: "cxc" }, "?"))));
    body.push(h("div", { class: "cxfam", style: `--fam:${palette(f).main}` }, h("b", null, familyLabel(f)), h("div", { class: "cxgrid" }, ...cells)));
  }
  body.push(h("h2", null, "Mutaciones descubiertas por ti"));
  body.push(game.codex.mutaciones.length === 0 ? h("p", { class: "dim" }, "Todavía ninguna. Aparecen al resonar, de vez en cuando.") : h("div", null, ...game.codex.mutaciones.map((m) => h("div", { class: "mut" }, h("b", null, generateMoveForKey(m.clave, pcfg.battle.moves).name), h("small", null, ` · ${m.clave} · resonancia ${m.resonancia}`)))));
  body.push(btn("Santuario", () => go("home")));
  return body;
}

// ------------------------------------------------------------------ 8. resonancia
function renderResonance(): Els {
  const ok = animas().filter((a) => isMature(lvl(a), pcfg) && a.criatura.offspringCount < MAX_ECOS);
  const A = resA ? findAnima(game, resA) : undefined;
  const B = resB ? findAnima(game, resB) : undefined;
  const odds = resonanceOdds(pcfg);
  const why = A && B ? canResonate(game, A.id, B.id, pcfg) : "Elige dos ánimas.";
  const pick = (a: Anima): void => {
    if (resA === a.id) resA = null;
    else if (resB === a.id) resB = null;
    else if (!resA) resA = a.id;
    else if (!resB) resB = a.id;
    else resB = a.id;
    render();
  };
  const sel = (a: Anima | undefined, lbl: string): HTMLElement =>
    a ? h("div", { class: "rpar", style: `--fam:${palette(a.criatura.family).main}` }, art(a.criatura, 72), h("b", null, a.nombre), h("small", null, `${familyLabel(a.criatura.family)} · nivel ${lvl(a)}`), h("small", { class: "dim" }, `Ecos ${dots(a.criatura.offspringCount, MAX_ECOS)}`), h("small", { class: "dim" }, `Pureza ${pureza(a.criatura)}`)) : h("div", { class: "rpar empty" }, h("small", null, lbl));
  const youngCount = animas().filter((a) => !isMature(lvl(a), pcfg)).length;
  return [
    h("h2", null, "Resonancia"),
    h("p", { class: "intro" }, "Dos ánimas maduras resuenan y prenden un eco que hereda de las dos... o se sale del guion."),
    h("div", { class: "rpair" }, sel(A, "Primera ánima"), h("span", { class: "plus" }, "+"), sel(B, "Segunda ánima")),
    A && B ? h("div", { class: "rinfo" }, h("div", null, h("b", null, `Coste: ${resonanceCost(A, B, pcfg)} de esencia`), h("small", null, ` (tienes ${game.recursos.esencia})`)), h("div", { class: "odds" }, `Para cada zona del cuerpo: ≈ ${pct1(odds.fromA)} de ${A.nombre} · ≈ ${pct1(odds.fromB)} de ${B.nombre} · ≈ ${pct1(odds.surprise)} sorpresa (gen oculto o mutación).`), why ? h("div", { class: "note warn" }, why) : null) : null,
    h("div", { class: "actions" }, btn("Resonar", () => doResonate(), "primary big", !A || !B || why !== null)),
    h("h3", null, `Ánimas que pueden resonar (${ok.length})`),
    youngCount > 0 ? h("small", { class: "dim" }, `${youngCount} aún sin madurar (nivel ${pcfg.unlocks.matureLevel}).`) : null,
    h("div", { class: "clist" }, ...(ok.length === 0 ? [h("p", { class: "dim" }, "Ninguna ánima madura. Sube a tu inicial hasta el nivel 5 combatiendo.")] : ok.map((a) => h("div", { class: "crow" + (resA === a.id || resB === a.id ? " inteam" : ""), style: `--fam:${palette(a.criatura.family).main}`, "data-anima": a.id, onclick: () => pick(a) }, h("div", { class: "cmain" }, art(a.criatura, 44), h("div", { class: "ci" }, h("b", null, a.nombre), h("small", null, `${familyLabel(a.criatura.family)} · nivel ${lvl(a)} · ecos ${dots(a.criatura.offspringCount, MAX_ECOS)}`))), h("span", { class: "atag" }, resA === a.id ? "1.ª" : resB === a.id ? "2.ª" : ""))))),
    btn("Santuario", () => go("home")),
  ];
}
function doResonate(): void {
  guard(() => {
    const before = game;
    const r = resonate(game, resA as string, resB as string, pcfg);
    game = r.game;
    persist(); // antes de enseñar el eco: recargar no da otra tirada
    const newFamilies = game.codex.familias.filter((f) => !before.codex.familias.includes(f));
    echoOut = { r, newGenes: game.codex.genes.length - before.codex.genes.length, newFamilies, parents: [before.animas.find((x) => x.id === resA)?.nombre ?? "", before.animas.find((x) => x.id === resB)?.nombre ?? ""] };
    draftName = r.echo.nombre;
    go("echo");
  });
}
function renderEcho(): Els {
  const o = echoOut as NonNullable<typeof echoOut>;
  const e = findAnima(game, o.r.echo.id) ?? o.r.echo;
  const c = e.criatura;
  const rows = o.r.origins.map((og) => {
    const g = c.genome[og.locus].D;
    let txt: string;
    if (og.mutated) txt = "¡Mutación!";
    else {
      const who = nameOf(og.parentId as string);
      txt = og.slot === "D" ? `de ${who}` : `oculto de ${who} (sorpresa)`;
    }
    return h("div", { class: "orow", style: `--fam:${palette(g.family).main}` }, h("span", { class: "gl" }, LOCUS_NAME[og.locus]), h("b", null, familyLabel(g.family)), h("small", null, generateMoveForKey(geneKey(g), pcfg.battle.moves).name), h("span", { class: "otag" + (og.mutated ? " mut" : og.slot !== "D" ? " sur" : "") }, txt));
  });
  return [
    h("div", { class: "echo", style: `--fam:${palette(c.family).main}` }, h("h2", null, "Ha nacido un eco"), h("div", { class: "echoart" }, art(c, 150)), chip(c.family), h("small", null, ` Pureza ${pureza(c)} · hijo de ${o.parents[0]} y ${o.parents[1]} · coste ${o.r.cost} de esencia`)),
    o.newFamilies.length > 0 ? h("div", { class: "note ok" }, `Nuevo en el Codex: familia ${o.newFamilies.map(familyLabel).join(", ")}.`) : null,
    o.newGenes > 0 ? h("div", { class: "note ok" }, `${o.newGenes} gen${o.newGenes > 1 ? "es" : ""} nuevo${o.newGenes > 1 ? "s" : ""} en el Codex.`) : null,
    o.r.breed.mutations.some((m) => !m.matchesCatalog) ? h("div", { class: "note ok" }, "Mutación descubierta por ti: queda registrada en el Codex.") : null,
    h("h3", null, "De dónde viene cada zona"),
    ...rows,
    h("div", { class: "namebox" }, h("label", null, "Nombre del eco"), nameInput((v) => (draftName = v)), btn("Guardar nombre", () => guard(() => ((game = rename(game, e.id, draftName, pcfg)), persist(), (flash = "Nombre guardado."), render())))),
    h("div", { class: "actions" }, btn("Resonar otra vez", () => ((resA = null), (resB = null), go("resonance")), "primary grow"), btn("Ver ficha", () => ((sheetId = e.id), go("sheet"))), btn("Santuario", () => go("home"))),
  ];
}

// ------------------------------------------------------------------ 9. variantes
const AXIS: Record<string, string> = { modificador: "Modificador", estado: "Estado", condicion: "Condición" };
function changeText(c: VariantCandidate): string {
  return c.change.pieza === "ninguno" ? `${AXIS[c.change.eje] ?? c.change.eje}: se quita` : `${AXIS[c.change.eje] ?? c.change.eje}: ${c.change.pieza.replace(/_/g, " ")}`;
}
function renderVariants(): Els {
  const a = findAnima(game, variantId ?? "");
  const offers = a ? animaPendingVariants(game, a.id, pcfg) : [];
  const back = (): void => (variantBack === "sheet" ? ((sheetId = a?.id ?? null), go("sheet")) : variantBack === "result" && enc ? go("result") : go("home"));
  if (!a || offers.length === 0) return [h("p", null, "No hay variantes pendientes."), btn("Volver", back, "primary")];
  const o = offers[0]!;
  const col = (title: string, m: Move, extra: Kid, pickBtn?: HTMLElement): HTMLElement => h("div", { class: "vcol" }, h("div", { class: "vt" }, title), moveBox(m), extra ?? null, pickBtn ?? null);
  return [
    h("h2", null, `${a.nombre}: variante de nivel ${o.level}`),
    h("p", { class: "intro" }, `Elige cómo cambia su movimiento de ${LOCUS_NAME[o.locus].toLowerCase()}. La elección es para siempre; podrás volver al original en el santuario (ficha del ánima).`),
    h("div", { class: "vgrid" },
      col("Original", o.original, null),
      col("Opción A", o.A.move, h("small", { class: "chg" }, changeText(o.A)), btn("Elegir A", () => pickVariant(a.id, o.level, "A", back), "primary")),
      o.B ? col("Opción B", o.B.move, h("small", { class: "chg" }, changeText(o.B)), btn("Elegir B", () => pickVariant(a.id, o.level, "B", back), "primary")) : h("div", { class: "vcol empty" }, h("small", null, "Este gen solo admite una variante.")),
    ),
    offers.length > 1 ? h("small", { class: "dim" }, `Después, ${offers.length - 1} más.`) : null,
    btn("Decidir más tarde", back),
  ];
}
function pickVariant(id: string, level: number, which: "A" | "B", back: () => void): void {
  guard(() => {
    game = chooseVariant(game, id, level, which, pcfg);
    persist();
    flash = "Variante elegida y activada.";
    if (animaPendingVariants(game, id, pcfg).length > 0) render();
    else back();
  });
}

// ------------------------------------------------------------------ 10. guardado
function renderSave(): Els {
  const text = serialize(game);
  return [
    h("h2", null, "Guardado"),
    h("p", { class: "intro" }, storageOk ? "La partida se guarda sola en este navegador antes de cada resultado con azar. Recargar no cambia lo que ya ha pasado." : "No se puede guardar automáticamente aquí. Exporta el texto y guárdalo tú."),
    h("small", { class: "dim" }, `Semilla ${game.semilla} · sesión ${game.registro.sesiones} · ${animas().length} ánimas`),
    h("h3", null, "Exportar"),
    h("textarea", { class: "ta", readonly: true, rows: 5, id: "exp" }, text),
    h("div", { class: "actions" }, btn("Copiar", () => {
      const done = (): void => { flash = "Copiado."; render(); };
      try {
        void navigator.clipboard.writeText(text).then(done, () => ((flash = "No se pudo copiar: selecciona el texto a mano."), render()));
      } catch {
        flash = "No se pudo copiar: selecciona el texto a mano.";
        render();
      }
    }), btn("Descargar", () => {
      try {
        const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: "application/json" })), download: "genoma-partida.json" });
        a.click();
      } catch {
        flash = "No se pudo descargar.";
        render();
      }
    })),
    h("h3", null, "Importar"),
    (() => {
      const ta = h("textarea", { class: "ta", rows: 4, id: "imp", placeholder: "Pega aquí el texto de una partida exportada" }) as HTMLTextAreaElement;
      ta.value = importText;
      ta.addEventListener("input", () => (importText = ta.value));
      return ta;
    })(),
    importMsg ? h("div", { class: "note warn" }, importMsg) : null,
    h("div", { class: "actions" }, btn("Cargar partida", () => {
      try {
        const r = parseSave(importText.trim(), pcfg);
        game = r.game;
        persist();
        importText = "";
        importMsg = "";
        flash = "Partida cargada." + (r.notes.length ? " " + r.notes.join(" ") : "");
        enc = null;
        go(game.inicial.elegida === null ? "intro" : "home");
      } catch (e) {
        importMsg = e instanceof Error ? e.message : String(e);
        render();
      }
    }, "", false)),
    h("h3", null, "Nueva partida"),
    h("p", { class: "dim" }, "Borra la partida actual y empieza con otra semilla. No se puede deshacer."),
    btn("Nueva partida…", () => ((confirmNew = true), render()), "danger"),
    confirmNew ? confirmBox("¿Empezar de cero?", "Se pierde toda la colección, el Codex y el progreso. Exporta antes si quieres conservarla.", "Sí, borrar", () => {
      game = newGame(newSeed(), pcfg);
      countSession();
      persist();
      confirmNew = false;
      enc = null;
      introStep = 0;
      starterPick = null;
      flash = "";
      go("intro");
    }, () => ((confirmNew = false), render())) : "",
  ];
}

function renderFatal(): Els {
  return [
    h("h2", null, "La partida guardada no se puede leer"),
    h("p", null, fatal),
    h("p", { class: "dim" }, "No se ha borrado nada. Puedes importar otra partida o empezar una nueva (esto sustituye la guardada)."),
    h("textarea", { class: "ta", rows: 4, id: "imp", placeholder: "Pega aquí una partida exportada" }),
    h("div", { class: "actions" }, btn("Importar", () => {
      try {
        const r = parseSave(((document.getElementById("imp") as HTMLTextAreaElement).value ?? "").trim(), pcfg);
        game = r.game;
        persist();
        screen = "home";
        render();
      } catch (e) {
        fatal = e instanceof Error ? e.message : String(e);
        render();
      }
    }), btn("Empezar de cero", () => {
      game = newGame(newSeed(), pcfg);
      countSession();
      persist();
      screen = "intro";
      render();
    }, "danger")),
  ];
}

// ------------------------------------------------------------------ render
function render(top = false): void {
  const y = window.scrollY;
  if (screen === "battle") return; // lo pinta battle.ts
  app.className = "ani";
  const body: Record<Exclude<Screen, "battle">, () => Els> = {
    intro: renderIntro,
    starter: renderStarter,
    home: renderHome,
    zones: renderZones,
    prefight: renderPrefight,
    result: renderResult,
    variants: renderVariants,
    collection: renderCollection,
    sheet: renderSheet,
    resonance: renderResonance,
    echo: renderEcho,
    codex: renderCodex,
    save: renderSave,
    fatal: renderFatal,
  };
  const noTop = screen === "intro" || screen === "starter" || screen === "fatal";
  app.replaceChildren(...(noTop ? [h("div", { class: "atop" }, h("div", { class: "arow" }, h("h1", null, "Ánimas")), flash ? h("div", { class: "note" }, flash) : null)] : [topBar()]), ...(body[screen]().filter((x) => !!x) as HTMLElement[]));
  window.scrollTo(0, top ? 0 : y);
}

// hooks para pruebas (Playwright): no los usa el juego
(window as unknown as { __genoma?: unknown }).__genoma = { get game() { return game; }, get screen() { return screen; } };

boot();
render(true);
