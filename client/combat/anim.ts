/** Reproducción animada de los eventos de un turno sobre el campo de batalla (DOM + Web Animations API, sin librerías). */
import type { BattleEvent, BattleState, SideId, StatusInstance } from "../../packages/core/src/index.ts";
import { cfg, palette } from "./data.ts";
import { key, statusName } from "./narrate.ts";

export interface UnitEls {
  readonly unit: HTMLElement;
  readonly ico: HTMLElement;
  readonly bar: HTMLElement;
  readonly hp: HTMLElement;
  readonly chips: HTMLElement;
  readonly maxHp: number;
  readonly family: string;
}
export interface Field {
  readonly el: HTMLElement;
  readonly units: Map<string, UnitEls>;
  readonly energy: Record<SideId, HTMLElement>;
}
export interface Player {
  setSpeed(s: 1 | 2): void;
  skip(): void;
  cancel(): void;
}

const idx = (s: SideId): 0 | 1 => (s === "A" ? 0 : 1);
export const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

interface View {
  hp: number;
  ko: boolean;
  statuses: StatusInstance[];
}

export function chipText(s: StatusInstance): string {
  return `${statusName(s.id)}${s.id === "quemadura" ? ` x${s.value}` : s.id === "escudo" ? ` ${s.value}` : ""}${s.turns > 0 ? ` ${s.turns}t` : ""}`;
}

const G = (d: string): string => `<svg viewBox="0 0 14 14" aria-hidden="true"><path d="${d}"/></svg>`;
/** Glifos propios de un solo trazo para cada estado. */
const STATUS_ICON: Record<string, string> = {
  quemadura: G("M7 1.5C8 4 11 5.5 11 9a4 4 0 0 1-8 0c0-1.7 1-2.7 1.7-3.5.2 1 .8 1.6 1.4 1.8C6 6 6.2 3.5 7 1.5Z"),
  aturdir: G("M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5Z"),
  ralentizar: G("M7 2V11M3.5 7.5L7 11.5L10.5 7.5"),
  debilitar: G("M2 12L5.2 8.8M7 7L11.5 2.5M9 4l2 2M3 9l2 2"),
  marca: G("M7 2.5a4.5 4.5 0 1 0 .01 0ZM7 6a1 1 0 1 0 .01 0ZM7 .5V3M7 11V13.5M.5 7H3M11 7H13.5"),
  prisa: G("M3 7.5L7 3.5L11 7.5M3 12L7 8L11 12"),
  regenerar: G("M7 2.5V11.5M2.5 7H11.5"),
  escudo: G("M7 1.5L12 3.5V7.5C12 10.5 9.5 12 7 13C4.5 12 2 10.5 2 7.5V3.5Z"),
};
/** Iconos de "eficaz" (chispa que sube) y "poco eficaz" (escudo agrietado); el texto exacto va solo en el detalle del turno. */
const EFF_ICON = {
  eff: '<svg viewBox="0 0 24 24" role="img" aria-label="Eficaz"><path d="M12 21V9M6 14L12 7.5L18 14"/><path d="M19 2.5l.9 2.1L22 5.5l-2.1.9L19 8.5l-.9-2.1L16 5.5l2.1-.9Z"/></svg>',
  weak: '<svg viewBox="0 0 24 24" role="img" aria-label="Poco eficaz"><path d="M12 3L19 6V12C19 16.5 15.5 19.5 12 21C8.5 19.5 5 16.5 5 12V6Z"/><path d="M12 3L10.5 9L13.5 12L11 17"/></svg>',
};

/** Pinta el estado de una unidad (vida, KO, estados). `pop` anima los estados nuevos. El texto de los estados va en `hp` (se ve al tocar o pasar el ratón). */
export function paintUnit(u: UnitEls, v: View, pop: boolean): void {
  u.bar.style.width = `${Math.max(0, Math.round((v.hp / u.maxHp) * 100))}%`;
  u.bar.className = v.hp / u.maxHp < 0.3 ? "low" : "";
  const wrap = u.bar.parentElement as HTMLElement;
  wrap.classList.toggle("lowbar", !v.ko && v.hp > 0 && v.hp / u.maxHp < 0.3);
  const esc = v.statuses.find((s) => s.id === "escudo");
  let sh = wrap.querySelector("i.sh") as HTMLElement | null;
  if (esc && !sh) {
    sh = document.createElement("i");
    sh.className = "sh";
    wrap.append(sh);
  }
  if (sh) {
    if (esc) sh.style.width = `${Math.min(100, Math.round((esc.value / u.maxHp) * 100))}%`;
    else sh.remove();
  }
  u.hp.textContent = v.ko ? "KO" : `${Math.max(0, v.hp)}/${u.maxHp}${v.statuses.length ? " · " + v.statuses.map(chipText).join(", ") : ""}`;
  u.unit.classList.toggle("ko", v.ko);
  const old = new Set(Array.from(u.chips.children).map((c) => (c as HTMLElement).dataset["s"]));
  u.chips.replaceChildren();
  for (const s of v.statuses) {
    if (s.id === "escudo") continue;
    const c = document.createElement("span");
    c.className = "chip " + cfg.combat.statuses[s.id].kind;
    c.dataset["s"] = s.id;
    c.title = chipText(s);
    c.setAttribute("aria-label", chipText(s));
    c.innerHTML = `<span class="cg">${STATUS_ICON[s.id] ?? ""}</span>${s.turns > 0 ? `<sub>${s.turns}</sub>` : ""}`;
    if (pop && !old.has(s.id) && !reducedMotion() && c.animate) c.animate([{ transform: "scale(.2)", opacity: 0 }, { transform: "scale(1.35)", opacity: 1, offset: 0.6 }, { transform: "scale(1)" }], { duration: 320 });
    u.chips.append(c);
  }
}

export function viewFrom(st: BattleState, side: SideId, pos: number): View {
  const f = st.fighters[idx(side)][pos - 1] as BattleState["fighters"][0][0];
  return { hp: f.hp, ko: f.ko, statuses: f.statuses.map((s) => ({ ...s })) };
}

export function paintEnergy(el: HTMLElement, n: number): void {
  el.textContent = `Energía ${n}`;
}

/** Texto del subtítulo de una acción. */
function who(names: readonly [readonly string[], readonly string[]], side: SideId, pos: number): string {
  return `${names[idx(side)][pos - 1] ?? side + pos}${side === "B" ? " (rival)" : ""}`;
}

/** Duración base (ms a ×1 sin factor) de cada evento, para ajustar el total del turno. */
function planDurations(events: readonly BattleEvent[]): number {
  let t = 0;
  for (const e of events) {
    switch (e.type) {
      case "action":
        t += 750;
        break;
      case "damage":
      case "heal":
      case "shield":
      case "status":
      case "drain":
      case "immune":
        t += 130;
        break;
      case "cancel":
      case "lost":
        t += 450;
        break;
      case "burn":
      case "regen":
        t += 300;
        break;
      case "ko":
        t += 520;
        break;
      case "end":
        t += 400;
        break;
      default:
        break;
    }
  }
  return t;
}

/**
 * Reproduce `events` sobre `field`. Al terminar (o al saltar) sincroniza con `after`.
 * `before` es el estado previo al turno; `done` se llama una vez al final.
 */
export function playTurn(field: Field, before: BattleState, after: BattleState, events: readonly BattleEvent[], names: readonly [readonly string[], readonly string[]], subtitle: HTMLElement, speed0: 1 | 2, done: () => void): Player {
  let speed = speed0;
  let skipped = false;
  let cancelled = false;
  const reduced = reducedMotion();
  const tf = Math.min(1, 8500 / Math.max(1, planDurations(events)));
  const views = new Map<string, View>();
  for (const side of ["A", "B"] as SideId[]) for (let p = 1; p <= 4; p++) views.set(key(side, p), viewFrom(before, side, p));
  const bonus: Record<SideId, readonly number[]> = { A: [], B: [] };
  const floatCount = new Map<string, number>();
  let wake: (() => void) | null = null;

  const sleep = (ms: number): Promise<void> =>
    skipped || cancelled
      ? Promise.resolve()
      : new Promise((res) => {
          const t = setTimeout(() => ((wake = null), res()), (ms * tf) / speed);
          wake = () => (clearTimeout(t), (wake = null), res());
        });
  const dur = (ms: number): number => (ms * tf) / speed;
  const fx = (): boolean => !skipped && !cancelled;
  const unitOf = (side: SideId, pos: number): UnitEls | undefined => field.units.get(key(side, pos));
  const view = (side: SideId, pos: number): View => views.get(key(side, pos)) as View;
  const repaint = (side: SideId, pos: number, pop = true): void => {
    const u = unitOf(side, pos);
    if (u) paintUnit(u, view(side, pos), pop && fx());
  };
  const say = (t: string): void => {
    subtitle.textContent = t;
  };

  let dir = { x: 0, y: 0 };
  function floater(side: SideId, pos: number, text: string, cls: string, size?: number, icon?: string): void {
    const u = unitOf(side, pos);
    if (!u || !fx()) return;
    const k = key(side, pos);
    const n = floatCount.get(k) ?? 0;
    floatCount.set(k, n + 1);
    const el = document.createElement("div");
    el.className = "float " + cls;
    if (icon) {
      el.innerHTML = icon;
      el.style.color = text;
    } else el.textContent = text;
    if (size) el.style.fontSize = `${size}px`;
    const ox = ((n % 3) - 1) * 26;
    el.style.left = `calc(50% + ${ox}px)`;
    u.unit.append(el);
    const rise = reduced ? 0 : -38;
    const a = el.animate([{ transform: "translate(-50%,0) scale(1.6)", opacity: 0 }, { transform: `translate(-50%,${rise / 3}px) scale(1)`, opacity: 1, offset: 0.12 }, { transform: `translate(-50%,${rise}px) scale(1)`, opacity: 1, offset: 0.7 }, { transform: `translate(-50%,${rise}px) scale(1)`, opacity: 0 }], { duration: dur(1000), delay: dur(90) * (n % 4), fill: "backwards", easing: "cubic-bezier(.2,1.4,.4,1)" });
    a.onfinish = () => el.remove();
  }
  /** Golpe recibido: destello plano, retroceso y aplastamiento, sacudida. */
  function hit(side: SideId, pos: number, strong: boolean): void {
    const u = unitOf(side, pos);
    if (!u || !fx()) return;
    const d = dur(strong ? 340 : 300);
    if (!reduced) {
      const k = strong ? 14 : 11;
      u.ico.animate([{ transform: "none" }, { transform: `translate(${dir.x * k}px,${dir.y * k}px) scale(1.12,.88)`, offset: 0.3 }, { transform: "translateX(-7px)", offset: 0.5 }, { transform: "translateX(6px)", offset: 0.7 }, { transform: "translateX(-3px)", offset: 0.85 }, { transform: "none" }], { duration: d });
    }
    u.ico.animate([{ filter: "brightness(3) saturate(0)" }, { filter: "brightness(3) saturate(0)", offset: 0.2 }, { filter: "brightness(1)" }], { duration: d });
  }
  /** Temblor breve de toda la escena (apagado con movimiento reducido). */
  function sceneShake(strong: boolean): void {
    if (!fx() || reduced) return;
    const a = strong ? 8 : 4;
    field.el.animate([{ transform: "none" }, { transform: `translate(${-a}px,${a / 2}px)` }, { transform: `translate(${a * 0.75}px,${-a / 3}px)` }, { transform: `translate(${-a * 0.5}px,0)` }, { transform: `translate(${a * 0.25}px,0)` }, { transform: "none" }], { duration: dur(strong ? 260 : 160) });
  }
  function glow(side: SideId, pos: number, color: string): void {
    const u = unitOf(side, pos);
    if (!u || !fx()) return;
    u.ico.animate([{ filter: `drop-shadow(0 0 0 ${color})` }, { filter: `drop-shadow(0 0 14px ${color}) brightness(1.4)`, offset: 0.5 }, { filter: `drop-shadow(0 0 0 ${color})` }], { duration: dur(500) });
  }
  function burst(side: SideId, pos: number, color: string, big: boolean): void {
    const u = unitOf(side, pos);
    if (!u || !fx() || reduced) return;
    const r = document.createElement("div");
    r.className = "ring";
    r.style.borderColor = color;
    u.unit.append(r);
    const a = r.animate([{ transform: "translate(-50%,-50%) scale(.3)", opacity: 1 }, { transform: `translate(-50%,-50%) scale(${big ? 2.4 : 1.6})`, opacity: 0 }], { duration: dur(big ? 600 : 400) });
    a.onfinish = () => r.remove();
  }
  const center = (el: HTMLElement): { x: number; y: number } => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  /** Movimiento de ataque; devuelve ms hasta el impacto (ya escalados con velocidad en `sleep`). */
  function attackAnim(e: Extract<BattleEvent, { type: "action" }>, color: string, ranged: boolean, buff: boolean): number {
    const a = unitOf(e.side, e.actor);
    if (!a || !fx() || e.targets.length === 0) return 0;
    if (buff || reduced) {
      glow(e.side, e.actor, color);
      return reduced ? 0 : 250;
    }
    const tgts = e.targets.map((t) => unitOf(e.targetSide, t)).filter((u): u is UnitEls => u !== undefined);
    const c0 = center(a.ico);
    if (!ranged) {
      const c1 = center((tgts[0] as UnitEls).ico);
      const dx = (c1.x - c0.x) * 0.72;
      const dy = (c1.y - c0.y) * 0.72;
      a.unit.style.zIndex = "20";
      // anticipación 140 ms, ataque 110 ms, parada 90 ms, regreso 240 ms
      const an = a.unit.animate(
        [
          { transform: "none", easing: "cubic-bezier(.3,0,.7,1)" },
          { transform: `translate(${dx * -0.19}px,${dy * -0.19}px) scale(.92,1.08)`, offset: 0.241, easing: "cubic-bezier(.7,0,1,.6)" },
          { transform: `translate(${dx}px,${dy}px) scale(1.18,.9)`, offset: 0.431 },
          { transform: `translate(${dx}px,${dy}px) scale(1.18,.9)`, offset: 0.586, easing: "cubic-bezier(.2,.9,.3,1.2)" },
          { transform: "none" },
        ],
        { duration: dur(580) },
      );
      an.onfinish = () => (a.unit.style.zIndex = "");
      return 250;
    }
    glow(e.side, e.actor, color);
    const fr = field.el.getBoundingClientRect();
    for (const t of tgts) {
      const c1 = center(t.ico);
      const p = document.createElement("div");
      p.className = "proj";
      p.style.background = color;
      p.style.boxShadow = `0 0 12px 4px ${color}`;
      p.style.left = `${c0.x - fr.left}px`;
      p.style.top = `${c0.y - fr.top}px`;
      field.el.append(p);
      const an = p.animate([{ transform: "translate(-50%,-50%) scale(.6)" }, { transform: `translate(calc(-50% + ${c1.x - c0.x}px),calc(-50% + ${c1.y - c0.y}px)) scale(1.1)` }], { duration: dur(300), easing: "ease-in" });
      an.onfinish = () => p.remove();
    }
    return 300;
  }

  const sleepOrAbort = async (ms: number): Promise<boolean> => {
    await sleep(ms);
    return !cancelled;
  };

  async function run(): Promise<void> {
    let curFamily: string | null = null;
    let curColor = "#fff";
    let acting: UnitEls | null = null;
    const clearActing = (): void => {
      if (acting) acting.unit.classList.remove("acting");
      acting = null;
    };
    for (let i = 0; i < events.length; i++) {
      if (cancelled) return;
      const e = events[i] as BattleEvent;
      switch (e.type) {
        case "turn":
          paintEnergy(field.energy.A, e.energy[0]);
          paintEnergy(field.energy.B, e.energy[1]);
          break;
        case "plan":
          bonus[e.side] = e.synergy;
          break;
        case "action": {
          clearActing();
          const m = e.move === 0 ? null : before.teams[idx(e.side)][e.actor - 1]?.moves[e.move - 1] ?? null;
          curFamily = m ? m.family : (before.teams[idx(e.side)][e.actor - 1]?.family ?? null);
          curColor = palette(curFamily ?? "sombra").main;
          const mvName = m ? m.name : "golpe básico";
          say(e.targets.length === 0 ? `${who(names, e.side, e.actor)} usa ${mvName}, pero ya no queda objetivo.` : `${who(names, e.side, e.actor)} usa ${mvName} sobre ${e.targets.map((t) => who(names, e.targetSide, t)).join(" y ")}.`);
          const u = unitOf(e.side, e.actor);
          if (u) (acting = u).unit.classList.add("acting");
          const sb = bonus[e.side][e.actor - 1] ?? 0;
          if (m && sb > 0) floater(e.side, e.actor, `Sinergia +${Math.round(sb * 100)} %`, "syn");
          const buff = e.targetSide === e.side;
          const tu = e.targets.length > 0 ? unitOf(e.targetSide, e.targets[0] as number) : undefined;
          if (u && tu) {
            const ca = center(u.ico);
            const cb = center(tu.ico);
            const l = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1;
            dir = { x: (cb.x - ca.x) / l, y: (cb.y - ca.y) / l };
          }
          const hit = attackAnim(e, curColor, m !== null && (m.modifier === "alcance" || m.area), buff);
          if (!(await sleepOrAbort(hit || 150))) return;
          break;
        }
        case "cancel":
          say(`${who(names, e.side, e.actor)} ${e.reason === "aturdido" ? "está aturdido y pierde su acción" : "ya está KO y no actúa"}.`);
          floater(e.side, e.actor, e.reason === "aturdido" ? "¡Aturdido!" : "KO", "info");
          if (!(await sleepOrAbort(450))) return;
          break;
        case "lost":
          say(`La acción de ${who(names, e.side, e.actor)} se pierde: no queda objetivo.`);
          if (!(await sleepOrAbort(300))) return;
          break;
        case "damage": {
          const v = view(e.side, e.pos);
          v.hp = e.hp;
          if (e.absorbed > 0) {
            const sh = v.statuses.find((s) => s.id === "escudo");
            if (sh) {
              const rest = sh.value - e.absorbed;
              v.statuses = rest > 0 ? v.statuses.map((s) => (s.id === "escudo" ? { ...s, value: rest } : s)) : v.statuses.filter((s) => s.id !== "escudo");
            }
          }
          repaint(e.side, e.pos, false);
          const tf2 = before.teams[idx(e.side)][e.pos - 1]?.family;
          const r = curFamily && tf2 ? (cfg.combat.families.table[curFamily] as Record<string, number> | undefined)?.[tf2] : undefined;
          const maxHp = unitOf(e.side, e.pos)?.maxHp ?? 100;
          const strong = (r !== undefined && r > 1) || e.hp <= 0 || e.amount > maxHp * 0.3;
          hit(e.side, e.pos, strong);
          sceneShake(strong);
          burst(e.side, e.pos, curColor, strong);
          if (e.amount > 0) floater(e.side, e.pos, `-${e.amount}`, "dmg", strong ? 34 : e.amount < maxHp * 0.1 ? 20 : 26);
          if (e.absorbed > 0) floater(e.side, e.pos, `-${e.absorbed}`, "shd");
          if (r !== undefined && r > 1) floater(e.side, e.pos, curColor, "eff", undefined, EFF_ICON.eff);
          else if (r !== undefined && r < 1) floater(e.side, e.pos, curColor, "weak", undefined, EFF_ICON.weak);
          if (e.condition) floater(e.side, e.pos, "¡Condición!", "syn");
          if (!(await sleepOrAbort(strong ? 110 : 80))) return;
          break;
        }
        case "drain":
        case "heal":
        case "regen": {
          const v = view(e.side, e.pos);
          v.hp = e.hp;
          repaint(e.side, e.pos, false);
          glow(e.side, e.pos, "#6fd08c");
          floater(e.side, e.pos, `+${e.amount}`, "heal");
          if (e.type === "regen") {
            say(`${who(names, e.side, e.pos)} regenera ${e.amount}.`);
            if (!(await sleepOrAbort(300))) return;
          } else if (!(await sleepOrAbort(130))) return;
          break;
        }
        case "shield": {
          const v = view(e.side, e.pos);
          const had = v.statuses.find((s) => s.id === "escudo");
          v.statuses = had ? v.statuses.map((s) => (s.id === "escudo" ? { ...s, value: e.total } : s)) : [...v.statuses, { id: "escudo", turns: 0, value: e.total }];
          repaint(e.side, e.pos);
          glow(e.side, e.pos, "#6db1ff");
          floater(e.side, e.pos, `+${e.amount}`, "shd");
          if (!(await sleepOrAbort(130))) return;
          break;
        }
        case "status": {
          const v = view(e.side, e.pos);
          const ni: StatusInstance = { id: e.status, turns: e.turns, value: e.value };
          v.statuses = v.statuses.some((s) => s.id === e.status) ? v.statuses.map((s) => (s.id === e.status ? ni : s)) : [...v.statuses, ni];
          repaint(e.side, e.pos);
          floater(e.side, e.pos, statusName(e.status), cfg.combat.statuses[e.status].kind === "positivo" ? "heal" : "stat");
          if (!(await sleepOrAbort(130))) return;
          break;
        }
        case "immune":
          floater(e.side, e.pos, "Inmune", "info");
          if (!(await sleepOrAbort(130))) return;
          break;
        case "expire": {
          const v = view(e.side, e.pos);
          v.statuses = v.statuses.filter((s) => s.id !== e.status);
          repaint(e.side, e.pos);
          break;
        }
        case "burn": {
          clearActing();
          curColor = palette("llama").main;
          curFamily = null;
          const v = view(e.side, e.pos);
          v.hp = e.hp;
          say(`La quemadura hace ${e.amount} de daño a ${who(names, e.side, e.pos)}.`);
          repaint(e.side, e.pos, false);
          hit(e.side, e.pos, false);
          floater(e.side, e.pos, `-${e.amount}`, "dmg");
          if (!(await sleepOrAbort(300))) return;
          break;
        }
        case "ko": {
          const v = view(e.side, e.pos);
          v.ko = true;
          v.hp = 0;
          say(`${who(names, e.side, e.pos)} cae KO.`);
          const u = unitOf(e.side, e.pos);
          if (u && fx() && !reduced) {
            // destello, parada, el alma se encoge y sube como un hilo de humo
            u.ico.animate(
              [
                { offset: 0, filter: "brightness(3) saturate(0)", transform: "none", opacity: 1 },
                { offset: 0.135, filter: "brightness(1)", transform: "none", opacity: 1 },
                { offset: 0.346, filter: "brightness(1)", transform: "none", opacity: 1, easing: "ease-in" },
                { offset: 0.596, transform: "scale(1.15,.2)", opacity: 0.9 },
                { offset: 1, transform: "translateY(-46px) scale(.25,1.3)", opacity: 0 },
              ],
              { duration: dur(520), fill: "forwards" },
            );
            const w = document.createElement("div");
            w.className = "wisp";
            u.unit.append(w);
            const wa = w.animate([{ opacity: 0, transform: "translate(-50%,0) scaleY(.2)" }, { opacity: 0.8, offset: 0.3 }, { opacity: 0, transform: "translate(-50%,-40px) scaleY(1.3) skewX(12deg)" }], { duration: dur(380), delay: dur(250), fill: "backwards" });
            wa.onfinish = () => w.remove();
            burst(e.side, e.pos, "#ffffff", true);
            floater(e.side, e.pos, "KO", "ko", 28);
            if (!(await sleepOrAbort(520))) return;
          } else if (fx()) {
            floater(e.side, e.pos, "KO", "ko", 28);
            if (!(await sleepOrAbort(250))) return;
          }
          repaint(e.side, e.pos, false);
          break;
        }
        case "energy": {
          paintEnergy(field.energy[e.side], e.energy);
          break;
        }
        case "end":
          clearActing();
          say(e.result === "A" ? "¡Victoria!" : e.result === "B" ? "Derrota." : "Empate.");
          if (!(await sleepOrAbort(400))) return;
          break;
        default:
          break;
      }
      // cierra el resalte del actor cuando termina su grupo de efectos
      const nx = events[i + 1];
      if (!nx || nx.type === "action" || nx.type === "cancel" || nx.type === "lost" || nx.type === "burn" || nx.type === "end") {
        if (e.type !== "action") {
          if (!(await sleepOrAbort(e.type === "turn" || e.type === "plan" || e.type === "order" ? 0 : 150))) return;
        }
        clearActing();
      }
    }
  }

  function finish(): void {
    for (const side of ["A", "B"] as SideId[]) {
      for (let p = 1; p <= 4; p++) {
        const u = unitOf(side, p);
        if (u) paintUnit(u, viewFrom(after, side, p), false);
      }
      paintEnergy(field.energy[side], after.energy[idx(side)]);
    }
    for (const u of field.units.values()) u.unit.classList.remove("acting");
    field.el.querySelectorAll(".float,.ring,.proj").forEach((n) => n.remove());
  }

  void run().then(() => {
    if (cancelled) return;
    finish();
    say(subtitle.textContent || "");
    done();
  });

  return {
    setSpeed(s) {
      speed = s;
    },
    skip() {
      skipped = true;
      if (wake) wake();
    },
    cancel() {
      cancelled = true;
      if (wake) wake();
    },
  };
}
