/** Mapa caminable del Prado (spec mundo v0.1 §2, §7): canvas, cámara, entrada, diálogos y transiciones.
 *  Las reglas (paso, encuentro, ruta, interacción) son del núcleo; aquí solo se dibuja y se llama a su API pública. */
import {
  activatorAt,
  activeEntities,
  entityAt,
  exitOpen,
  facingTarget,
  interact,
  mapById,
  planRoute,
  step,
  type Dir,
  type Encounter,
  type GameState,
  type MapDef,
  type WorldEntity,
  type WorldState,
} from "../../packages/core/src/index.ts";
import { palette } from "../combat/data.ts";
import { mix } from "../art/palette.ts";
import { h } from "./battle.ts";
import { ARNAL, LOOK, pcfg, wcfg } from "./data.ts";
import {
  LOOKS,
  TAU,
  canopySprite,
  canvas,
  col,
  doorX,
  drawFigure,
  drawGround,
  drawLantern,
  drawStaff,
  h01,
  haloSprite,
  hash32,
  portrait,
  staffOf,
  terrainOf,
  tuftSprite,
  wave,
  type Ctx,
  type Face,
  type FigureLook,
  type Terrain,
} from "./wdraw.ts";

export type SaveWhat = "none" | "world" | "both";
export interface MapHooks {
  game(): GameState;
  world(): WorldState;
  /** Fija mundo y partida y guarda: «world» = solo el mundo; «both» = primero el mundo y después la partida (§3.4). */
  commit(w: WorldState, g: GameState, save: SaveWhat): void;
  onDoor(): void;
  onExit(zones: readonly string[]): void;
  onEncounter(e: Encounter): void;
  onArnalIntro(): void;
  menu(): { label: string; fn: () => void; primary?: boolean }[];
}
export interface Line {
  readonly who: string | null; // id de LOOKS para el retrato (null = cartel)
  readonly name: string | null;
  readonly text: string;
}

// ------------------------------------------------------------------ estado del módulo
let H: MapHooks | null = null;
let root: HTMLElement | null = null;
let cv: HTMLCanvasElement | null = null;
let ctx: Ctx | null = null;
let raf = 0;
let alive = false;
let map: MapDef = wcfg.maps[0] as MapDef;
const T: Terrain = terrainOf(map);
const DOOR_X = doorX(T);
const DOOR_Y = (() => { for (let y = 0; y < map.height; y++) if (T.ch(DOOR_X, y) === "P") return y; return 0; })();
const SANCT_TOP = (() => { for (let y = 0; y < map.height; y++) if ((map.rows[y] as string).includes("H")) return y; return 0; })();

// escala
let tileCss = 32;
let dpr = 1;
let S = 32; // px de dispositivo por casilla
let vw = 11, vh = 13; // casillas visibles (fraccionarias)
let cssW = 352, cssH = 416;

// cachés por escala
let blocks: (HTMLCanvasElement | null)[] = [];
let tufts: { alta: HTMLCanvasElement[]; espesa: HTMLCanvasElement[] }[] = [];
let canopies: HTMLCanvasElement[] = [];
const sprites = new Map<string, HTMLCanvasElement>();
let punch: HTMLCanvasElement | null = null;
let warm: HTMLCanvasElement | null = null;
let cool: HTMLCanvasElement | null = null;
let fly: HTMLCanvasElement | null = null;
let lightC: { c: HTMLCanvasElement; x: Ctx } | null = null;
let vignette: HTMLCanvasElement | null = null;
const BLOCK = LOOK.escala.bloque_cache_casillas;

// listas precalculadas
const grassRows: [number, number, boolean][][] = [];
const trees: [number, number][] = [];
const waterTiles: [number, number][] = [];
const flyAnchors: [number, number][] = [];
(() => {
  for (let y = 0; y < map.height; y++) {
    const row: [number, number, boolean][] = [];
    for (let x = 0; x < map.width; x++) {
      const c = T.ch(x, y);
      if (c === "," || c === ";") row.push([x, y, c === ";"]);
      if (c === "T") trees.push([x, y]);
      if (c === "~") waterTiles.push([x, y]);
    }
    grassRows.push(row);
  }
  const cand: [number, number, number][] = [];
  for (let y = 1; y < map.height - 1; y++) for (let x = 1; x < map.width - 1; x++) {
    const c = T.ch(x, y);
    if (c === "," || c === ";" || c === "~") cand.push([x, y, h01(x, y, 901)]);
  }
  cand.sort((a, b) => a[2] - b[2]);
  for (const [x, y] of cand.slice(0, 48)) flyAnchors.push([x, y]);
})();

// jugador y movimiento
interface Move { fx: number; fy: number; tx: number; ty: number; t0: number; dur: number }
let mv: Move | null = null;
let bump: { dx: number; dy: number; t0: number } | null = null;
let stepCount = 0;
let enteredAt = -1e9; // momento en que pisó la casilla actual (para apartar la hierba)
let held: Dir | null = null;
let queued: Dir | null = null;
let blockedDir: Dir | null = null;
let route: Dir[] = [];
let routeTarget: { x: number; y: number; use: boolean } | null = null;
let marker: { x: number; y: number; t0: number; bad: boolean } | null = null;
let pendingEnc: Encounter | null = null;
const npcFace = new Map<string, Face>();

// transiciones
type Trans = { kind: "enc"; t0: number; color: string; ex: number; ey: number; done: () => void } | { kind: "close"; t0: number; dur: number; done: () => void } | { kind: "open"; t0: number; dur: number };
let trans: Trans | null = null;

// diálogo y menú
let dlg: { lines: Line[]; i: number; t0: number; el: HTMLElement; txt: HTMLElement; done: (() => void) | null } | null = null;
let menuEl: HTMLElement | null = null;
let hudEl: HTMLElement | null = null;
let hintEl: HTMLElement | null = null;

// ambiente
const reducedPref = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
let reduced = reducedPref;
let asomo: { x: number; y: number; t0: number; color: string } | null = null;
let nextAsomo = 0;
const PRADO_FAMS = pcfg.world.zones.find((z) => z.id === map.zone)?.families ?? ["brote"];

// medidas
const stats = { frames: 0, drawMs: 0, since: 0, slowSince: -1, fps: 0, avgDraw: 0 };
let lastNow = 0;

// ------------------------------------------------------------------ montaje
export function mountMap(host: HTMLElement, hooks: MapHooks, opts: { open?: boolean; greet?: Line[] } = {}): void {
  unmountMap();
  H = hooks;
  map = mapById(wcfg, hooks.world().mapa);
  root = host;
  host.className = "wmap";
  hudEl = h("div", { class: "whud" });
  cv = h("canvas", { class: "wcv", "aria-label": "Mapa del Prado de la Linde" }) as HTMLCanvasElement;
  const stage = h("div", { class: "wstage" }, h("div", { class: "wframe" }, cv));
  hintEl = h("div", { class: "whint" });
  host.replaceChildren(hudEl, stage, hintEl);
  ctx = cv.getContext("2d") as Ctx;
  updateHud();
  resize();
  cv.addEventListener("pointerdown", onPointer);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", resize);
  window.addEventListener("blur", onBlur);
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", onVis);
  mv = null;
  bump = null;
  route = [];
  routeTarget = null;
  held = queued = blockedDir = null;
  pendingEnc = null;
  marker = null;
  trans = opts.open === false ? null : { kind: "open", t0: performance.now(), dur: 450 };
  alive = true;
  nextAsomo = performance.now() + 4000;
  raf = requestAnimationFrame(frame);
  if (opts.greet && opts.greet.length) say(opts.greet, null);
}
export function unmountMap(): void {
  alive = false;
  cancelAnimationFrame(raf);
  if (cv) cv.removeEventListener("pointerdown", onPointer);
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("resize", resize);
  window.removeEventListener("blur", onBlur);
  window.removeEventListener("pagehide", onHide);
  document.removeEventListener("visibilitychange", onVis);
  dlg = null;
  menuEl = null;
  H = null;
  cv = null;
}
export function mapMounted(): boolean {
  return alive;
}
export function mapStats(): { fps: number; drawMs: number; S: number; reduced: boolean } {
  return { fps: Math.round(stats.fps), drawMs: Math.round(stats.avgDraw * 100) / 100, S, reduced };
}

export const LANTERN_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.5v2" stroke="#c9a46a" stroke-width="1.4" stroke-linecap="round"/><path d="M4 5h8l-1 1H5z" fill="#6b4a33"/><rect x="5" y="6" width="6" height="7" rx="1.6" fill="#3a2a22"/><rect x="6.2" y="7.2" width="3.6" height="4.6" rx="1" fill="#ffcf5a"/><path d="M4.5 13.5h7" stroke="#6b4a33" stroke-width="1.4" stroke-linecap="round"/></svg>';
export const ESSENCE_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.5 10 6.5 14.5 8 10 9.5 8 14.5 6 9.5 1.5 8 6 6.5z" fill="#9fe3ff"/><circle cx="8" cy="8" r="1.6" fill="#ffffff"/></svg>';

export function updateHud(): void {
  if (!hudEl || !H) return;
  const g = H.game();
  const res = h("div", { class: "wres" });
  res.innerHTML = `<span title="Faroles">${LANTERN_ICON}<b>${g.recursos.faroles}</b></span><span title="Esencia">${ESSENCE_ICON}<b>${g.recursos.esencia}</b></span>`;
  hudEl.replaceChildren(
    h("div", { class: "wzone" }, h("b", null, map.name), h("small", null, "atardecer")),
    res,
    h("button", { class: "wmenu", "aria-label": "Menú", onclick: () => openMenu() }, h("i", null), h("i", null), h("i", null)),
  );
  if (hintEl) {
    const coarse = (() => { try { return matchMedia("(pointer: coarse)").matches; } catch { return false; } })();
    hintEl.textContent = g.inicial.elegida === null
      ? `Habla con ${ARNAL.nombre}: ${coarse ? "tócalo" : "ponte a su lado y pulsa Espacio"}.`
      : coarse ? "Toca una casilla para ir · tócate para el menú" : "Flechas o WASD para andar · Espacio para hablar · M menú";
  }
}

// ------------------------------------------------------------------ escala y cachés
function resize(): void {
  if (!cv || !root) return;
  const small = window.innerWidth < LOOK.escala.ancho_corte_css_px;
  tileCss = small ? LOOK.escala.casilla_css_px.movil : LOOK.escala.casilla_css_px.escritorio;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const stage = cv.parentElement?.parentElement as HTMLElement;
  const availW = Math.max(200, stage.clientWidth);
  const availH = Math.max(200, stage.clientHeight);
  const [mc, mr] = small ? [LOOK.escala.vista_casillas.movil[0] ?? 11, map.height] : [LOOK.escala.vista_casillas.escritorio[0] ?? 17, LOOK.escala.vista_casillas.escritorio[1] ?? 13];
  cssW = Math.floor(Math.min(availW, mc * tileCss, map.width * tileCss));
  cssH = Math.floor(Math.min(availH, mr * tileCss, map.height * tileCss));
  cv.style.width = `${cssW}px`;
  cv.style.height = `${cssH}px`;
  if (hudEl) hudEl.style.maxWidth = `${cssW}px`;
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  vw = cssW / tileCss;
  vh = cssH / tileCss;
  const newS = tileCss * dpr;
  if (newS !== S || blocks.length === 0) {
    S = newS;
    buildCaches();
  }
  lightC = canvas(cv.width, cv.height);
  const v = canvas(cv.width, cv.height);
  const g = v.x.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.3, cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.72);
  g.addColorStop(0, "rgba(6,7,16,0)");
  g.addColorStop(1, `rgba(6,7,16,${LOOK.luz_ambiente.vineta_alfa})`);
  v.x.fillStyle = g;
  v.x.fillRect(0, 0, cv.width, cv.height);
  vignette = v.c;
}
function buildCaches(): void {
  sprites.clear();
  const bw = Math.ceil(map.width / BLOCK), bh = Math.ceil(map.height / BLOCK);
  blocks = [];
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      const b = canvas(BLOCK * S, BLOCK * S);
      b.x.setTransform(S, 0, 0, S, -bx * BLOCK * S, -by * BLOCK * S);
      drawGround(b.x, T, bx * BLOCK, by * BLOCK, bx * BLOCK + BLOCK - 1, by * BLOCK + BLOCK - 1);
      blocks.push(b.c);
    }
  tufts = [false, true].map((front) => ({ alta: [0, 1, 2, 3].map((v) => tuftSprite(S, false, v, front)), espesa: [0, 1, 2, 3].map((v) => tuftSprite(S, true, v + 10, front)) }));
  canopies = [0, 1, 2, 3, 4].map((v) => canopySprite(S, v));
  punch = haloSprite(256, "255,255,255", 1);
  warm = haloSprite(256, "255,190,90", 0.55);
  cool = haloSprite(256, "160,200,255", 0.4);
  fly = haloSprite(64, "255,240,160", 0.9);
}
function figureSprite(who: string, dir: Face, frame: number): HTMLCanvasElement {
  const key = `${who}|${dir}|${frame}`;
  let c = sprites.get(key);
  if (!c) {
    const L = LOOKS[who] as FigureLook;
    const k = canvas(S * 1.6, S * 1.6);
    k.x.setTransform(S, 0, 0, S, S * 0.3, S * 0.55);
    drawFigure(k.x, L, dir, frame);
    c = k.c;
    sprites.set(key, c);
  }
  return c;
}

// ------------------------------------------------------------------ entrada
/** Al ocultar o cerrar la página se guarda la posición (entre medias solo cada 10 pasos, §5.1). */
function onHide(): void {
  if (H) H.commit(H.world(), H.game(), "world");
}
function onVis(): void {
  if (document.hidden) {
    cancelAnimationFrame(raf);
    onHide();
  }
  else if (alive) {
    lastNow = 0;
    raf = requestAnimationFrame(frame);
  }
}
function onBlur(): void {
  held = null;
  queued = null;
}
const KEYDIR: Record<string, Dir> = { ArrowUp: "n", ArrowRight: "e", ArrowDown: "s", ArrowLeft: "o", w: "n", d: "e", s: "s", a: "o", W: "n", D: "e", S: "s", A: "o" };
function busy(): boolean {
  return (trans !== null && trans.kind !== "open") || pendingEnc !== null || menuEl !== null;
}
function onKey(e: KeyboardEvent): void {
  if (!alive) return;
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (menuEl) {
    if (e.key === "Escape" || e.key === "m" || e.key === "M") { closeMenu(); e.preventDefault(); }
    return;
  }
  if (dlg) {
    if (e.key === " " || e.key === "Enter" || e.key === "e" || e.key === "E" || e.key === "Escape") {
      e.preventDefault();
      if (!e.repeat) advance();
    }
    return;
  }
  const d = KEYDIR[e.key];
  if (d) {
    e.preventDefault();
    if (e.repeat) return;
    held = d;
    blockedDir = null;
    route = [];
    routeTarget = null;
    marker = null;
    queued = d; // un toque corto da un paso aunque se suelte antes del siguiente frame
    return;
  }
  if (e.key === " " || e.key === "Enter" || e.key === "e" || e.key === "E") {
    e.preventDefault();
    if (!mv && !busy() && !e.repeat) use();
  } else if (e.key === "Escape" || e.key === "m" || e.key === "M") {
    e.preventDefault();
    if (!busy()) openMenu();
  }
}
function onKeyUp(e: KeyboardEvent): void {
  const d = KEYDIR[e.key];
  if (d && held === d) held = null;
}
function camera(now: number): { ox: number; oy: number; px: number; py: number } {
  const p = playerPos(now);
  const cx = map.width <= vw ? map.width / 2 : Math.min(Math.max(p.x + 0.5, vw / 2), map.width - vw / 2);
  const cy = map.height <= vh ? map.height / 2 : Math.min(Math.max(p.y + 0.5, vh / 2), map.height - vh / 2);
  return { ox: Math.round((vw / 2 - cx) * S), oy: Math.round((vh / 2 - cy) * S), px: p.x, py: p.y };
}
function onPointer(e: PointerEvent): void {
  if (!alive || !H || !cv) return;
  e.preventDefault();
  if (dlg) { advance(); return; }
  if (busy()) return;
  const r = cv.getBoundingClientRect();
  const cam = camera(performance.now());
  const tx = Math.floor(((e.clientX - r.left) * dpr - cam.ox) / S);
  const ty = Math.floor(((e.clientY - r.top) * dpr - cam.oy) / S);
  const w = H.world();
  if (tx === w.pos.x && ty === w.pos.y && !mv) { openMenu(); return; }
  goTo(tx, ty);
}
/** Ruta táctil: `planRoute` del núcleo, ejecutada paso a paso con `step`. */
export function goTo(tx: number, ty: number): void {
  if (!H) return;
  const w = H.world();
  const target = entityAt(w, wcfg, tx, ty) !== null || activatorAt(wcfg, w.mapa, tx, ty) !== null;
  const r = planRoute(w, H.game(), { x: tx, y: ty }, wcfg);
  held = null;
  queued = null;
  if (r === null) {
    route = [];
    routeTarget = null;
    marker = { x: tx, y: ty, t0: performance.now(), bad: true };
    return;
  }
  route = r.slice();
  routeTarget = { x: tx, y: ty, use: target };
  marker = { x: tx, y: ty, t0: performance.now(), bad: false };
  if (route.length === 0 && target && !mv) {
    routeTarget = null;
    marker = null;
    use();
  }
}

// ------------------------------------------------------------------ pasos e interacción
function playerPos(now: number): { x: number; y: number } {
  const w = H?.world();
  if (!w) return { x: 0, y: 0 };
  let x = w.pos.x, y = w.pos.y;
  if (mv) {
    const t = Math.min(1, (now - mv.t0) / mv.dur);
    x = mv.fx + (mv.tx - mv.fx) * t;
    y = mv.fy + (mv.ty - mv.fy) * t;
  }
  if (bump) {
    const t = (now - bump.t0) / 80;
    if (t >= 1) bump = null;
    else {
      const k = 0.09 * (t < 0.5 ? t * 2 : 2 - t * 2);
      x += bump.dx * k;
      y += bump.dy * k;
    }
  }
  return { x, y };
}
function tryStep(dir: Dir, now: number, fromRoute: boolean): void {
  if (!H) return;
  const w0 = H.world();
  const g0 = H.game();
  const last = fromRoute && route.length === 0;
  const r = step(w0, g0, dir, wcfg, pcfg);
  const o = r.outcome;
  const v = wcfg.movement.vec[dir];
  switch (o.kind) {
    case "moved":
    case "encounter": {
      stepCount++;
      const grass = o.tile.encounterPct > 0;
      if (o.kind === "encounter") {
        H.commit(r.world, r.game, "both"); // mundo primero, partida después (§3.4)
        pendingEnc = o.encounter;
        route = [];
        held = null;
        queued = null;
      } else {
        if (o.error) console.warn("encuentro no disponible:", o.error);
        H.commit(r.world, r.game, grass || stepCount % 10 === 0 ? "world" : "none");
      }
      mv = { fx: w0.pos.x, fy: w0.pos.y, tx: r.world.pos.x, ty: r.world.pos.y, t0: now, dur: wcfg.movement.msPerStep };
      enteredAt = now + wcfg.movement.msPerStep * 0.5;
      break;
    }
    case "blocked": {
      H.commit(r.world, r.game, "none");
      route = [];
      bump = { dx: v.dx, dy: v.dy, t0: now };
      blockedDir = dir;
      if (o.reason === "entity" && last && routeTarget?.use) {
        routeTarget = null;
        marker = null;
        use();
      } else if (o.reason === "no_starter") {
        const arnal = map.entities.find((e) => e.kind === "personaje");
        say([{ who: "arnal", name: ARNAL.nombre, text: arnal && arnal.kind === "personaje" ? arnal.noStarterText : "Sin un ánima, mejor no." }], null);
      } else if (o.reason === "exit_locked") {
        say([{ who: null, name: null, text: o.text ?? "No se puede pasar." }], null);
      }
      if (!last) { routeTarget = null; marker = null; }
      break;
    }
    case "door":
      // M-03: el paso ya da el evento; no se llama además a interact
      H.commit(r.world, r.game, "world");
      route = [];
      routeTarget = null;
      marker = null;
      leave(() => H?.onDoor());
      break;
    case "exit": {
      H.commit(r.world, r.game, "world");
      route = [];
      routeTarget = null;
      marker = null;
      const zones = o.zones;
      leave(() => H?.onExit(zones));
      break;
    }
  }
}
function leave(done: () => void): void {
  held = null;
  queued = null;
  trans = { kind: "close", t0: performance.now(), dur: 320, done };
}
function faceToward(id: string, from: { x: number; y: number }, at: { x: number; y: number }): void {
  const dx = from.x - at.x, dy = from.y - at.y;
  npcFace.set(id, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "e" : "o") : dy > 0 ? "s" : "n");
}
/** «Usar» la casilla a la que se mira (`interact` del núcleo). */
function use(): void {
  if (!H) return;
  const w0 = H.world();
  const g0 = H.game();
  const ft = facingTarget(w0, wcfg);
  const r = interact(w0, g0, wcfg, pcfg);
  const o = r.outcome;
  if (ft.entity) faceToward(ft.entity.id, w0.pos, ft.entity);
  switch (o.kind) {
    case "talk": {
      const isArnal = o.id === "arnal" || o.name === null;
      H.commit(r.world, r.game, r.world !== w0 ? "world" : "none");
      say(o.text.map((t) => ({ who: isArnal ? "arnal" : o.id, name: isArnal ? ARNAL.nombre : o.name, text: t })), null);
      break;
    }
    case "sign":
      say(o.text.map((t) => ({ who: null, name: null, text: t })), null);
      break;
    case "pickup":
      H.commit(r.world, r.game, "both"); // M-02: mundo primero, después la partida
      updateHud();
      say([...o.text.map((t) => ({ who: null, name: null, text: t })), { who: null, name: null, text: `+${o.faroles} farol. Ahora llevas ${r.game.recursos.faroles}.` }], null);
      break;
    case "pickup_full":
      say([{ who: null, name: null, text: o.text }], null);
      break;
    case "arnal_intro": {
      const lines = g0.inicial.intro_vista ? ["¿Ya te has decidido? Ven, elige tu ánima."] : ARNAL.texto_inicio;
      say(lines.map((t) => ({ who: "arnal", name: ARNAL.nombre, text: t })), () => leave(() => H?.onArnalIntro()));
      break;
    }
    case "door":
      leave(() => H?.onDoor());
      break;
    case "exit": {
      const zones = o.zones;
      leave(() => H?.onExit(zones));
      break;
    }
    case "exit_locked":
      say([{ who: null, name: null, text: o.text }], null);
      break;
    case "nothing":
      break;
  }
}

// ------------------------------------------------------------------ diálogo y menú
export function say(lines: Line[], done: (() => void) | null): void {
  if (!root || lines.length === 0) return;
  held = null;
  queued = null;
  route = [];
  const frameEl = root.querySelector(".wframe") as HTMLElement;
  dlg?.el.remove();
  const txt = h("div", { class: "dtx" });
  const el = h("div", { class: "dlg", role: "dialog", "aria-live": "polite", onclick: (e: Event) => { e.stopPropagation(); advance(); } });
  frameEl.append(el);
  dlg = { lines, i: 0, t0: performance.now(), el, txt, done };
  paintDlg();
}
function paintDlg(): void {
  if (!dlg) return;
  const ln = dlg.lines[dlg.i] as Line;
  const L = ln.who ? LOOKS[ln.who] : undefined;
  const accent = ln.who === null ? "#c9a46a" : L ? L.capa : "#c9a46a";
  dlg.el.style.setProperty("--spk", ln.who === "arnal" ? "#9fe3ff" : ln.who ? mix(accent, "#ffffff", 0.35) : accent);
  const kids: HTMLElement[] = [];
  if (ln.who && L) kids.push(h("div", { class: "dpic" }, portrait(ln.who, 44)));
  kids.push(h("div", { class: "dbody" }, ln.name ? h("b", { class: "dname" }, ln.name) : h("b", { class: "dname sign" }, ln.who === null && ln.name === null ? "" : ""), dlg.txt, h("span", { class: "dmore" }, dlg.i < dlg.lines.length - 1 ? "▸" : "■")));
  dlg.el.replaceChildren(...kids);
  dlg.el.classList.toggle("nosp", !ln.name);
  dlg.txt.textContent = "";
  dlg.t0 = performance.now();
}
function typed(): number {
  if (!dlg) return 0;
  return Math.floor((performance.now() - dlg.t0) / 22);
}
function advance(): void {
  if (!dlg) return;
  const ln = dlg.lines[dlg.i] as Line;
  if (typed() < ln.text.length) {
    dlg.t0 = -1e9; // muestra la línea entera
    return;
  }
  if (dlg.i < dlg.lines.length - 1) {
    dlg.i++;
    paintDlg();
    return;
  }
  const done = dlg.done;
  dlg.el.remove();
  dlg = null;
  done?.();
}
function openMenu(): void {
  if (!root || !H || menuEl) return;
  held = null;
  route = [];
  const items = H.menu();
  menuEl = h("div", { class: "wmenuov", onclick: (e: Event) => { if (e.target === menuEl) closeMenu(); } },
    h("div", { class: "wmenup" }, h("b", null, "Menú"), ...items.map((it) => h("button", { class: "btn" + (it.primary ? " primary" : ""), onclick: () => { closeMenu(); it.fn(); } }, it.label)), h("button", { class: "btn", onclick: () => closeMenu() }, "Seguir andando")));
  root.append(menuEl);
}
function closeMenu(): void {
  menuEl?.remove();
  menuEl = null;
}

// ------------------------------------------------------------------ bucle
function frame(now: number): void {
  if (!alive || !H || !ctx || !cv) return;
  const t0 = performance.now();
  update(now);
  if (!alive) return;
  draw(now);
  const dt = performance.now() - t0;
  // medidas (fps aproximados y ms de dibujo) y modo reducido si va lento
  if (lastNow > 0) {
    stats.frames++;
    stats.drawMs += dt;
    if (now - stats.since >= 1000) {
      stats.fps = (stats.frames * 1000) / (now - stats.since);
      stats.avgDraw = stats.drawMs / stats.frames;
      if (stats.avgDraw > LOOK.rendimiento.modo_reducido_si_frame_ms_mayor_que) {
        if (stats.slowSince < 0) stats.slowSince = now;
        else if (now - stats.slowSince > 2000) reduced = true;
      } else stats.slowSince = -1;
      stats.frames = 0;
      stats.drawMs = 0;
      stats.since = now;
    }
  } else stats.since = now;
  lastNow = now;
  raf = requestAnimationFrame(frame);
}
function update(now: number): void {
  if (!H) return;
  if (dlg) {
    const t = (dlg.lines[dlg.i] as Line).text;
    const n = Math.min(t.length, typed());
    if (dlg.txt.textContent?.length !== n) dlg.txt.textContent = t.slice(0, n);
  }
  if (mv && now >= mv.t0 + mv.dur) {
    mv = null;
    if (pendingEnc) {
      const e = pendingEnc;
      const w = H.world();
      const v = wcfg.movement.vec[w.mira];
      const first = e.wilds[0];
      trans = { kind: "enc", t0: now, color: palette(first ? first.creature.family : "brote").main, ex: w.pos.x + v.dx * 0.6, ey: w.pos.y + v.dy * 0.6, done: () => H?.onEncounter(e) };
    } else if (route.length === 0 && routeTarget) {
      const tgt = routeTarget;
      routeTarget = null;
      marker = null;
      if (tgt.use) use();
    }
  }
  if (trans) {
    const el = now - trans.t0;
    if (trans.kind === "enc" && el >= LOOK.transicion_encuentro.total_ms) {
      const d = trans.done;
      trans = null;
      pendingEnc = null;
      d();
      return;
    }
    if (trans.kind === "close" && el >= trans.dur) {
      const d = trans.done;
      trans = null;
      d();
      return;
    }
    if (trans.kind === "open" && el >= trans.dur) trans = null;
  }
  if (mv || dlg || busy()) return;
  let d: Dir | null = null;
  let fromRoute = false;
  if (queued) { d = queued; queued = null; }
  else if (held && held !== blockedDir) d = held;
  else if (route.length) { d = route.shift() as Dir; fromRoute = true; }
  if (d) tryStep(d, now, fromRoute);
  // ánimas que asoman (decorativo; hash del tiempo de pantalla y la posición, nunca el flujo «paso»)
  if (!reduced && now > nextAsomo) {
    const w = H.world();
    const k = Math.floor(now / 1000);
    const cands: [number, number][] = [];
    for (const row of grassRows) for (const [x, y] of row) {
      const dd = Math.max(Math.abs(x - w.pos.x), Math.abs(y - w.pos.y));
      if (dd >= LOOK.asomo.distancia_casillas[0] && dd <= LOOK.asomo.distancia_casillas[1] && Math.abs(x - w.pos.x) < vw / 2 - 0.5 && Math.abs(y - w.pos.y) < vh / 2 - 0.5) cands.push([x, y]);
    }
    if (cands.length) {
      const [ax, ay] = cands[hash32(k, w.pos.x * 64 + w.pos.y, 777) % cands.length] as [number, number];
      const fam = PRADO_FAMS[hash32(ax, ay, k) % PRADO_FAMS.length] as string;
      asomo = { x: ax, y: ay, t0: now, color: palette(fam).main };
    }
    const [a, b] = LOOK.asomo.cada_ms;
    nextAsomo = now + a + (b - a) * h01(k, 3, 778);
  }
  if (asomo && now - asomo.t0 > LOOK.asomo.dura_ms) asomo = null;
}

// ------------------------------------------------------------------ dibujo
function draw(now: number): void {
  const x = ctx as Ctx;
  const c = cv as HTMLCanvasElement;
  const w = (H as MapHooks).world();
  const g = (H as MapHooks).game();
  const cam = camera(now);
  const { ox, oy } = cam;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1;
  x.globalCompositeOperation = "source-over";
  x.fillStyle = LOOK.fondo;
  x.fillRect(0, 0, c.width, c.height);
  // capa estática por bloques
  const bw = Math.ceil(map.width / BLOCK);
  blocks.forEach((b, i) => {
    if (!b) return;
    const bx = (i % bw) * BLOCK * S + ox, by = Math.floor(i / bw) * BLOCK * S + oy;
    if (bx > c.width || by > c.height || bx + BLOCK * S < 0 || by + BLOCK * S < 0) return;
    x.drawImage(b, bx, by);
  });
  const x0 = Math.max(0, Math.floor(-ox / S) - 1), y0 = Math.max(0, Math.floor(-oy / S) - 1);
  const x1 = Math.min(map.width - 1, Math.ceil((c.width - ox) / S) + 1), y1 = Math.min(map.height - 1, Math.ceil((c.height - oy) / S) + 2);
  const inView = (tx: number, ty: number): boolean => tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1;
  x.setTransform(S, 0, 0, S, ox, oy);
  const motion = !reduced;
  // agua: brillos que aparecen y se apagan
  if (motion) {
    const per = LOOK.ambiente.agua_brillo_ms;
    x.fillStyle = col("agua", 3);
    for (const [tx, ty] of waterTiles) {
      if (!inView(tx, ty)) continue;
      for (let k = 0; k < 2; k++) {
        const a = wave(now / per + h01(tx, ty, 801 + k));
        if (a <= 0.35) continue;
        x.globalAlpha = (a - 0.35) * 1.5;
        const px = tx + 0.15 + 0.7 * h01(tx, ty, 811 + k), py = ty + 0.15 + 0.7 * h01(tx, ty, 821 + k);
        const L = (1.5 + a * 2.5) / S;
        x.fillRect(px - L, py - 0.6 / S, L * 2, 1.2 / S);
        x.fillRect(px - 0.6 / S, py - L * 0.6, 1.2 / S, L * 1.2);
      }
      const sx = wave(now / 5200 + h01(tx, ty, 831)) * 0.12;
      x.globalAlpha = 0.25;
      x.fillStyle = col("agua", 2);
      x.fillRect(tx + 0.3 + sx, ty + 0.55 + 0.2 * h01(tx, ty, 832), 0.3, 1.5 / S);
      x.fillStyle = col("agua", 3);
    }
    x.globalAlpha = 1;
  }
  // puerta del santuario: luz que respira, y farol colgado
  const breath = 0.75 + 0.15 * wave(now / LOOK.ambiente.puerta_respira_ms);
  if (inView(DOOR_X, DOOR_Y)) {
    const wallTop = SANCT_TOP + 1.15;
    const bot = DOOR_Y + 1;
    x.globalAlpha = breath;
    x.fillStyle = col("puerta_santuario", 1);
    x.beginPath();
    x.roundRect(DOOR_X + 0.5 - 0.28, wallTop + 0.22, 0.56, bot - wallTop - 0.2, [0.28, 0.28, 0, 0]);
    x.fill();
    x.fillStyle = col("puerta_santuario", 2);
    x.beginPath();
    x.roundRect(DOOR_X + 0.5 - 0.16, wallTop + 0.4, 0.32, bot - wallTop - 0.4, [0.16, 0.16, 0, 0]);
    x.fill();
    x.globalAlpha = 1;
    x.strokeStyle = "#2a1d14";
    x.lineWidth = 0.035;
    x.beginPath();
    x.moveTo(DOOR_X + 0.98, wallTop + 0.3);
    x.lineTo(DOOR_X + 1.22, wallTop + 0.3);
    x.stroke();
    drawLantern(x, DOOR_X + 1.2, wallTop + 0.3, motion ? 0.012 * wave(now / 2600) : 0, 1.1, breath);
  }
  // salida: niebla (cerrada) o luz fría (abierta)
  const exitA = map.activators.find((a) => a.kind === "salida");
  const exitIsOpen = exitA ? exitOpen(g, exitA, pcfg) : false;
  if (exitA && inView(exitA.x, exitA.y)) {
    for (let k = 0; k < 3; k++) {
      const ph = (now / 6000 + k / 3) % 1;
      const fx = exitA.x + 1.3 - ph * 2.2;
      const a = (ph < 0.2 ? ph / 0.2 : ph > 0.7 ? (1 - ph) / 0.3 : 1) * (exitIsOpen ? 0.12 : 0.32);
      x.globalAlpha = a;
      x.fillStyle = exitIsOpen ? "#bcd8ff" : col("salida", k % 2);
      x.beginPath();
      x.ellipse(fx, exitA.y + 0.2 + k * 0.32, 1.1, 0.42, 0, 0, TAU);
      x.fill();
    }
    x.globalAlpha = 1;
  }
  // sombras de personajes
  const ents = activeEntities(w, wcfg);
  x.fillStyle = "rgba(8,6,20,0.38)";
  for (const e of ents) {
    if (!inView(e.x, e.y) || e.kind === "objeto") continue;
    x.beginPath();
    x.ellipse(e.x + 0.5, e.y + 0.94, e.kind === "cartel" ? 0.22 : 0.3, 0.09, 0, 0, TAU);
    x.fill();
  }
  x.beginPath();
  x.ellipse(cam.px + 0.5, cam.py + 0.94, 0.28, 0.085, 0, 0, TAU);
  x.fill();
  // entidades por fila: personajes y jugador, después la hierba alta de esa fila (tapa los pies)
  const pRow = mv ? Math.max(mv.fy, mv.ty) : w.pos.y;
  const lights: [number, number, number, HTMLCanvasElement | null][] = [];
  for (let ty = y0; ty <= y1; ty++) {
    drawGrassRow(x, ty, x0, x1, now, w, 0);
    for (const e of ents) if (e.y === ty && inView(e.x, e.y)) drawEntity(x, e, now, g, lights);
    if (ty === pRow) drawPlayer(x, w, cam.px, cam.py, now, lights);
    drawGrassRow(x, ty, x0, x1, now, w, 1);
  }
  // copas por encima (semitransparentes si tapan al jugador)
  for (const [tx, ty] of trees) {
    if (tx < x0 - 1 || tx > x1 + 1 || ty < y0 || ty > y1 + 1) continue;
    const hide = cam.px + 0.75 > tx - 0.2 && cam.px + 0.25 < tx + 1.2 && cam.py + 0.95 > ty - 1.15 && cam.py + 0.15 < ty + 0.55;
    const v = hash32(tx, ty, 1001) % canopies.length;
    const s = 0.94 + 0.12 * h01(tx, ty, 1002);
    const sw = motion ? 0.01 * wave(now / 3400 + h01(tx, ty, 1003)) : 0;
    x.globalAlpha = hide ? 0.55 : 1;
    x.drawImage(canopies[v] as HTMLCanvasElement, tx + 0.5 - 0.85 * s + sw, ty - 0.35 - 1.0 * s, 1.7 * s, 2.0 * s);
  }
  x.globalAlpha = 1;
  // luz: velo de atardecer abierto por los faroles
  lights.push([DOOR_X + 0.5, DOOR_Y + 0.7, 1.7 * breath, warm], [DOOR_X + 1.2, SANCT_TOP + 1.6, 1.3, warm], [DOOR_X - 1.75, SANCT_TOP + 1.8, 0.8, warm], [DOOR_X + 2.25, SANCT_TOP + 1.8, 0.8, warm]);
  if (exitA && exitIsOpen) lights.push([exitA.x + 0.5, exitA.y + 0.5, 2.2, cool]);
  drawLight(x, ox, oy, lights);
  // partículas: luciérnagas, motas del farol y hojas
  if (motion) drawParticles(x, now, x0, x1, y0, y1, cam.px, cam.py, w);
  // interfaz: marcador, aviso de Arnal, burbuja de «usar»
  drawUi(x, now, w, g);
  // transiciones
  drawTrans(x, now, ox, oy, cam.px, cam.py);
}

function drawPlayer(x: Ctx, w: WorldState, px: number, py: number, now: number, lights: [number, number, number, HTMLCanvasElement | null][]): void {
  const L = LOOKS["farolero"] as FigureLook;
  const dir = w.mira as Face;
  let frame = -1;
  if (mv) frame = Math.min(3, Math.floor(((now - mv.t0) / mv.dur) * 4));
  const b = frame < 0 && !reduced ? 0.022 * wave(now / LOOK.animacion.respirar_ms) : 0;
  const st = staffOf(dir, L, frame);
  const swing = mv ? 0.035 * wave((now - mv.t0) / (mv.dur * 2) - 0.15) : reduced ? 0 : 0.012 * wave(now / 2400);
  const glow = 0.8 + 0.2 * wave(now / 700);
  const drawS = (): void => {
    x.save();
    x.translate(px, py);
    drawStaff(x, st, String(LOOK.personajes.farolero["baston"] ?? "#5e3e26"));
    drawLantern(x, st.x1 + 0.1, st.y1 - 0.03, swing, 1, glow);
    x.restore();
  };
  if (dir === "n") drawS();
  x.drawImage(figureSprite("farolero", dir, frame), px - 0.3, py - 0.55 - 1.5 * b, 1.6, 1.6 * (1 + b));
  if (dir !== "n") drawS();
  const halo = Number(LOOK.personajes.farolero["halo_radio_casillas"] ?? 2.5);
  lights.push([px + st.x1 + 0.1 + swing, py + st.y1 + 0.1, halo * (0.96 + 0.04 * glow), warm]);
}

function drawEntity(x: Ctx, e: WorldEntity, now: number, g: GameState, lights: [number, number, number, HTMLCanvasElement | null][]): void {
  const motion = !reduced;
  if (e.kind === "cartel") {
    x.fillStyle = "#4a3020";
    x.fillRect(e.x + 0.46, e.y + 0.45, 0.08, 0.5);
    x.fillStyle = "#6b4a33";
    x.beginPath();
    x.roundRect(e.x + 0.16, e.y + 0.2, 0.68, 0.4, 0.05);
    x.fill();
    x.fillStyle = "#8a6a44";
    x.beginPath();
    x.roundRect(e.x + 0.18, e.y + 0.21, 0.64, 0.32, 0.04);
    x.fill();
    x.fillStyle = "#4a3020";
    for (let i = 0; i < 3; i++) x.fillRect(e.x + 0.26, e.y + 0.28 + i * 0.08, i === 2 ? 0.3 : 0.48, 0.025);
    return;
  }
  if (e.kind === "objeto") {
    const fl = motion ? 0.75 + 0.25 * wave(now / 430 + 0.3 * wave(now / 1700)) : 0.9;
    x.fillStyle = "rgba(8,6,20,0.35)";
    x.beginPath();
    x.ellipse(e.x + 0.5, e.y + 0.82, 0.18, 0.06, 0, 0, TAU);
    x.fill();
    drawLantern(x, e.x + 0.5, e.y + 0.5, 0, 1.9, fl);
    lights.push([e.x + 0.5, e.y + 0.65, 1.1 * fl, warm]);
    return;
  }
  const who = e.kind === "personaje" ? "arnal" : e.id in LOOKS ? e.id : "tasia";
  const L = LOOKS[who] as FigureLook;
  const dir = npcFace.get(e.id) ?? ((e.facing ?? "s") as Face);
  const b = motion ? 0.02 * wave(now / LOOK.animacion.respirar_ms + h01(e.x, e.y, 5)) : 0;
  const st = staffOf(dir, L, -1);
  const staff = (): void => {
    if (who === "tasia") return;
    x.save();
    x.translate(e.x, e.y);
    drawStaff(x, st, "#5e3e26", who === "gorio");
    if (who === "arnal") drawLantern(x, st.x1 + 0.1, st.y1 - 0.03, motion ? 0.01 * wave(now / 2900) : 0, 1.35, 0.9);
    x.restore();
  };
  if (dir === "n") staff();
  x.drawImage(figureSprite(who, dir, -1), e.x - 0.3, e.y - 0.55 - 1.5 * b, 1.6, 1.6 * (1 + b));
  if (dir !== "n") staff();
  if (who === "arnal") lights.push([e.x + st.x1 + 0.1, e.y + st.y1 + 0.12, 1.8, warm]);
  void g;
}

function drawGrassRow(x: Ctx, ty: number, x0: number, x1: number, now: number, w: WorldState, layer: 0 | 1): void {
  const row = grassRows[ty];
  if (!row) return;
  const motion = !reduced;
  for (const [tx, , dense] of row) {
    if (tx < x0 || tx > x1) continue;
    const per = dense ? LOOK.ambiente.hierba_espesa_mece_ms : LOOK.ambiente.hierba_mece_ms;
    let k = motion ? (dense ? 0.05 : 0.065) * wave(now / per + h01(tx, ty, 1101) * 0.6 + tx * 0.07) : 0;
    let sx = 1, sy = 1;
    const onMe = tx === w.pos.x && ty === w.pos.y;
    if (onMe) {
      const el = now - enteredAt;
      if (el > 0 && el < 250) { const t = el / 250; sx = 1 + 0.16 * (1 - t); sy = 1 - 0.18 * (1 - t); }
      if (trans && trans.kind === "enc") {
        const te = now - trans.t0;
        if (te < LOOK.transicion_encuentro.temblor_ms + 120) { sy = 1 + 0.28 * Math.abs(wave(te / 90)); k += 0.08 * wave(te / 60); }
      }
    }
    if (asomo && asomo.x === tx && asomo.y === ty) k += 0.06 * wave((now - asomo.t0) / 110);
    const set = tufts[layer] as { alta: HTMLCanvasElement[]; espesa: HTMLCanvasElement[] };
    const sp = (dense ? set.espesa : set.alta)[hash32(tx, ty, 1102) % 4] as HTMLCanvasElement;
    // sesgo desde la base: las puntas se mecen, la base no
    x.save();
    x.transform(sx, 0, -k, sy, tx + 0.5 - 0.5 * sx + k, ty + 1 - sy);
    x.drawImage(sp, 0, -0.45, 1, 1.45);
    x.restore();
  }
}

function drawLight(x: Ctx, ox: number, oy: number, lights: [number, number, number, HTMLCanvasElement | null][]): void {
  if (!lightC || !punch) return;
  const lx = lightC.x;
  const c = lightC.c;
  lx.globalCompositeOperation = "source-over";
  lx.clearRect(0, 0, c.width, c.height);
  lx.fillStyle = LOOK.luz_ambiente.velo;
  lx.fillRect(0, 0, c.width, c.height);
  lx.globalCompositeOperation = "destination-out";
  for (const [px, py, r] of lights) {
    const R = r * S;
    lx.drawImage(punch, px * S + ox - R, py * S + oy - R, R * 2, R * 2);
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = "multiply";
  x.globalAlpha = Math.min(1, LOOK.luz_ambiente.velo_alfa * 1.6);
  x.drawImage(c, 0, 0);
  x.globalCompositeOperation = "lighter";
  for (const [px, py, r, spr] of lights) {
    if (!spr) continue;
    const R = r * S * 0.85;
    x.globalAlpha = 0.5;
    x.drawImage(spr, px * S + ox - R, py * S + oy - R, R * 2, R * 2);
  }
  x.globalCompositeOperation = "source-over";
  x.globalAlpha = 1;
  if (vignette) x.drawImage(vignette, 0, 0);
  x.setTransform(S, 0, 0, S, ox, oy);
}

function drawParticles(x: Ctx, now: number, x0: number, x1: number, y0: number, y1: number, px: number, py: number, w: WorldState): void {
  const A = LOOK.ambiente;
  let n = 0;
  x.globalCompositeOperation = "lighter";
  // luciérnagas
  for (let i = 0; i < flyAnchors.length && n < A.luciernagas.max; i++) {
    const [ax, ay] = flyAnchors[i] as [number, number];
    if (ax < x0 || ax > x1 || ay < y0 || ay > y1) continue;
    n++;
    const fx = ax + 0.5 + 0.7 * wave(now / (5200 + i * 37) + h01(i, 1, 1201));
    const fy = ay + 0.1 + 0.45 * wave(now / (3700 + i * 53) + h01(i, 2, 1202));
    const a = Math.max(0, wave(now / (1900 + i * 41) + h01(i, 3, 1203)));
    if (a < 0.05) continue;
    x.globalAlpha = a;
    x.drawImage(fly as HTMLCanvasElement, fx - 0.16, fy - 0.16, 0.32, 0.32);
    x.fillStyle = A.luciernagas.colores[i % A.luciernagas.colores.length] ?? "#ffe58a";
    x.fillRect(fx - 1.2 / S, fy - 1.2 / S, 2.4 / S, 2.4 / S);
  }
  // motas alrededor del farol del jugador
  const st = staffOf(w.mira as Face, LOOKS["farolero"] as FigureLook, -1);
  const lx = px + st.x1 + 0.1, ly = py + st.y1 + 0.1;
  for (let i = 0; i < A.motas_farol.max; i++) {
    const ph = (now / 1700 + i / A.motas_farol.max) % 1;
    x.globalAlpha = (1 - ph) * 0.8;
    x.fillStyle = "#ffcf5a";
    const mx = lx + 0.18 * wave(ph * 1.3 + i * 0.37), my = ly - ph * 0.7;
    x.fillRect(mx - 0.8 / S, my - 0.8 / S, 1.6 / S, 1.6 / S);
  }
  x.globalCompositeOperation = "source-over";
  // hojas que caen de las copas visibles
  const vis = trees.filter(([tx, ty]) => tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1);
  if (vis.length) {
    for (let i = 0; i < A.hojas.max; i++) {
      const per = 5200;
      const tt = now + i * 1300;
      const cyc = Math.floor(tt / per);
      const ph = (tt % per) / per;
      const [tx, ty] = vis[hash32(cyc, i, 1301) % vis.length] as [number, number];
      const lx2 = tx + 0.5 + 0.5 * wave(ph * 1.5 + i * 0.3) + (h01(cyc, i, 1302) - 0.5);
      const ly2 = ty - 0.6 + ph * 1.6;
      x.globalAlpha = ph < 0.1 ? ph * 10 : ph > 0.85 ? (1 - ph) / 0.15 : 1;
      x.fillStyle = i % 2 ? "#c99a45" : "#5f9a5c";
      x.beginPath();
      x.ellipse(lx2, ly2, 0.06, 0.028, wave(ph * 2 + i * 0.2) * 1.2, 0, TAU);
      x.fill();
    }
  }
  x.globalAlpha = 1;
}

function drawUi(x: Ctx, now: number, w: WorldState, g: GameState): void {
  // ojos que asoman en la hierba
  if (asomo) {
    const t = (now - asomo.t0) / LOOK.asomo.dura_ms;
    const a = t < 0.25 ? t / 0.25 : t > 0.7 ? (1 - t) / 0.3 : 1;
    eyes(x, asomo.x + 0.5, asomo.y + 0.42, asomo.color, a, 0.9);
  }
  // marcador de destino
  if (marker) {
    const el = now - marker.t0;
    if (marker.bad) {
      if (el > 600) marker = null;
      else {
        x.globalAlpha = 1 - el / 600;
        x.strokeStyle = "#ff8a7a";
        x.lineWidth = 0.07;
        x.lineCap = "round";
        x.beginPath();
        x.moveTo(marker.x + 0.32, marker.y + 0.32);
        x.lineTo(marker.x + 0.68, marker.y + 0.68);
        x.moveTo(marker.x + 0.68, marker.y + 0.32);
        x.lineTo(marker.x + 0.32, marker.y + 0.68);
        x.stroke();
      }
    } else {
      const p = (el % 1000) / 1000;
      x.strokeStyle = "#ffcf5a";
      x.lineWidth = 0.05;
      x.globalAlpha = 0.9;
      x.beginPath();
      x.ellipse(marker.x + 0.5, marker.y + 0.78, 0.3, 0.13, 0, 0, TAU);
      x.stroke();
      x.globalAlpha = 1 - p;
      x.beginPath();
      x.ellipse(marker.x + 0.5, marker.y + 0.78, 0.3 + p * 0.25, 0.13 + p * 0.1, 0, 0, TAU);
      x.stroke();
      x.globalAlpha = 1;
      x.fillStyle = "#ffcf5a";
      const by = marker.y + 0.25 - 0.08 * Math.abs(wave(el / 900));
      x.beginPath();
      x.moveTo(marker.x + 0.5, by + 0.22);
      x.lineTo(marker.x + 0.38, by);
      x.lineTo(marker.x + 0.62, by);
      x.closePath();
      x.fill();
    }
    x.globalAlpha = 1;
  }
  // «!» sobre Arnal hasta la intro
  if (g.inicial.elegida === null) {
    const ar = map.entities.find((e) => e.kind === "personaje");
    if (ar) {
      const by = ar.y - 0.55 - 0.08 * Math.abs(wave(now / 1100));
      const ax = ar.x + 0.5;
      x.fillStyle = "#1b1622";
      x.beginPath();
      x.roundRect(ax - 0.17, by - 0.2, 0.34, 0.4, 0.12);
      x.fill();
      x.fillStyle = LOOK.personajes.aviso;
      x.beginPath();
      x.roundRect(ax - 0.045, by - 0.13, 0.09, 0.19, 0.04);
      x.fill();
      x.beginPath();
      x.arc(ax, by + 0.12, 0.045, 0, TAU);
      x.fill();
    }
  }
  // burbuja «usar» sobre lo que se tiene delante
  if (!mv && !dlg && !trans) {
    const ft = facingTarget(w, wcfg);
    if ((ft.entity || ft.activator) && !(ft.entity?.kind === "personaje" && g.inicial.elegida === null)) {
      const bx = ft.x + 0.5, by = ft.y - (ft.entity && ft.entity.kind !== "cartel" && ft.entity.kind !== "objeto" ? 0.45 : 0.05) - 0.04 * Math.abs(wave(now / 1300));
      x.fillStyle = "rgba(245,240,230,0.92)";
      x.beginPath();
      x.roundRect(bx - 0.2, by - 0.13, 0.4, 0.24, 0.1);
      x.fill();
      x.beginPath();
      x.moveTo(bx - 0.05, by + 0.1);
      x.lineTo(bx, by + 0.18);
      x.lineTo(bx + 0.05, by + 0.1);
      x.fill();
      x.fillStyle = "#2b2530";
      for (let i = -1; i <= 1; i++) {
        x.beginPath();
        x.arc(bx + i * 0.09, by - 0.01, 0.028, 0, TAU);
        x.fill();
      }
    }
  }
}
function eyes(x: Ctx, cx: number, cy: number, color: string, a: number, scale: number): void {
  if (a <= 0) return;
  x.globalAlpha = a * 0.55;
  x.fillStyle = "#05080a";
  x.beginPath();
  x.ellipse(cx, cy, 0.3 * scale, 0.14 * scale, 0, 0, TAU);
  x.fill();
  x.globalAlpha = a * 0.6;
  x.globalCompositeOperation = "lighter";
  x.drawImage(fly as HTMLCanvasElement, cx - 0.35 * scale, cy - 0.3 * scale, 0.7 * scale, 0.6 * scale);
  x.globalCompositeOperation = "source-over";
  x.globalAlpha = a;
  x.fillStyle = mix(color, "#ffffff", 0.35);
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(cx + s * 0.11 * scale, cy, 0.07 * scale, 0.04 * scale * (0.3 + 0.7 * a), s * 0.35, 0, TAU);
    x.fill();
  }
  x.globalAlpha = 1;
}

function drawTrans(x: Ctx, now: number, ox: number, oy: number, px: number, py: number): void {
  if (!trans || !cv) return;
  const el = now - trans.t0;
  const cx = (px + 0.5) * S + ox, cy = (py + 0.5) * S + oy;
  const diag = cv.width + cv.height;
  const hole = (r: number, alpha = 1): void => {
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = alpha;
    x.fillStyle = "#07080f";
    x.beginPath();
    x.rect(0, 0, (cv as HTMLCanvasElement).width, (cv as HTMLCanvasElement).height);
    if (r > 0) x.arc(cx, cy, r, 0, TAU);
    x.fill("evenodd");
    x.globalAlpha = 1;
    x.setTransform(S, 0, 0, S, ox, oy);
  };
  if (trans.kind === "open") {
    const t = Math.min(1, el / trans.dur);
    hole(diag * t * t, 1);
  } else if (trans.kind === "close") {
    const t = Math.min(1, el / trans.dur);
    hole(diag * (1 - t) * (1 - t), 1);
  } else {
    const P = LOOK.transicion_encuentro;
    const tEyes = P.temblor_ms, tFlash = tEyes + P.ojos_ms, tVig = tFlash + P.destello_ms;
    if (el >= tEyes) {
      const a = Math.min(1, (el - tEyes) / 150);
      eyes(x, trans.ex + 0.5, trans.ey + 0.5, trans.color, a, 1.7 + 0.5 * Math.min(1, (el - tEyes) / P.ojos_ms));
    }
    if (el >= tFlash && el < tVig + 60) {
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalAlpha = 0.85 * (1 - Math.max(0, el - tFlash) / (P.destello_ms + 60));
      x.fillStyle = "#fff6dc";
      x.fillRect(0, 0, cv.width, cv.height);
      x.globalAlpha = 1;
      x.setTransform(S, 0, 0, S, ox, oy);
    }
    if (el >= tVig) {
      const t = Math.min(1, (el - tVig) / P.vineta_ms);
      hole(diag * 0.6 * (1 - t) * (1 - t));
    }
  }
}

/** Para pruebas: posición en pantalla (CSS) del centro de una casilla. */
export function tileToClient(tx: number, ty: number): { x: number; y: number } | null {
  if (!cv) return null;
  const cam = camera(performance.now());
  const r = cv.getBoundingClientRect();
  return { x: r.left + ((tx + 0.5) * S + cam.ox) / dpr, y: r.top + ((ty + 0.5) * S + cam.oy) / dpr };
}
