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

/** Pinta el estado de una unidad (vida, KO, estados). `pop` anima los estados nuevos. */
export function paintUnit(u: UnitEls, v: View, pop: boolean): void {
  u.bar.style.width = `${Math.max(0, Math.round((v.hp / u.maxHp) * 100))}%`;
  u.bar.className = v.hp / u.maxHp < 0.3 ? "low" : "";
  u.hp.textContent = v.ko ? "KO" : `${Math.max(0, v.hp)}/${u.maxHp}`;
  u.unit.classList.toggle("ko", v.ko);
  const old = new Set(Array.from(u.chips.children).map((c) => (c as HTMLElement).dataset["s"]));
  u.chips.replaceChildren();
  for (const s of v.statuses) {
    const c = document.createElement("span");
    c.className = "chip " + cfg.combat.statuses[s.id].kind;
    c.dataset["s"] = s.id;
    c.textContent = chipText(s);
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
        t += 600;
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
        t += 250;
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
  const tf = Math.min(1, 7000 / Math.max(1, planDurations(events)));
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

  function floater(side: SideId, pos: number, text: string, cls: string): void {
    const u = unitOf(side, pos);
    if (!u || !fx()) return;
    const k = key(side, pos);
    const n = floatCount.get(k) ?? 0;
    floatCount.set(k, n + 1);
    const el = document.createElement("div");
    el.className = "float " + cls;
    el.textContent = text;
    el.style.left = `calc(50% + ${((n % 3) - 1) * 22}px)`;
    el.style.top = `${10 + (n % 2) * 16}px`;
    u.unit.append(el);
    const rise = reduced ? 0 : -38;
    const a = el.animate([{ transform: "translate(-50%,0)", opacity: 0 }, { transform: `translate(-50%,${rise / 3}px)`, opacity: 1, offset: 0.2 }, { transform: `translate(-50%,${rise}px)`, opacity: 1, offset: 0.7 }, { transform: `translate(-50%,${rise}px)`, opacity: 0 }], { duration: dur(1000) });
    a.onfinish = () => el.remove();
  }
  function shake(side: SideId, pos: number): void {
    const u = unitOf(side, pos);
    if (!u || !fx()) return;
    if (!reduced) u.ico.animate([{ transform: "translateX(0)" }, { transform: "translateX(-7px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(0)" }], { duration: dur(300) });
    u.ico.animate([{ filter: "brightness(1)" }, { filter: "brightness(2.2) saturate(.3)", offset: 0.3 }, { filter: "brightness(1)" }], { duration: dur(300) });
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
      const an = a.unit.animate([{ transform: "none" }, { transform: `translate(${dx * -0.08}px,${dy * -0.08}px) scale(1.05)`, offset: 0.2 }, { transform: `translate(${dx}px,${dy}px) scale(1.15)`, offset: 0.55 }, { transform: "none" }], { duration: dur(420), easing: "ease-in-out" });
      an.onfinish = () => (a.unit.style.zIndex = "");
      return 230;
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
          shake(e.side, e.pos);
          burst(e.side, e.pos, curColor, false);
          if (e.amount > 0) floater(e.side, e.pos, `-${e.amount}`, "dmg");
          if (e.absorbed > 0) floater(e.side, e.pos, `-${e.absorbed}`, "shd");
          const tf2 = before.teams[idx(e.side)][e.pos - 1]?.family;
          const r = curFamily && tf2 ? (cfg.combat.families.table[curFamily] as Record<string, number> | undefined)?.[tf2] : undefined;
          if (r !== undefined && r > 1) floater(e.side, e.pos, "¡Eficaz!", "eff");
          else if (r !== undefined && r < 1) floater(e.side, e.pos, "Poco eficaz", "weak");
          if (e.condition) floater(e.side, e.pos, "¡Condición!", "syn");
          if (!(await sleepOrAbort(130))) return;
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
          shake(e.side, e.pos);
          floater(e.side, e.pos, `-${e.amount}`, "dmg");
          if (!(await sleepOrAbort(300))) return;
          break;
        }
        case "ko": {
          const v = view(e.side, e.pos);
          v.ko = true;
          v.hp = 0;
          say(`${who(names, e.side, e.pos)} cae KO.`);
          repaint(e.side, e.pos, false);
          burst(e.side, e.pos, "#ffffff", true);
          floater(e.side, e.pos, "KO", "ko");
          if (!(await sleepOrAbort(250))) return;
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
