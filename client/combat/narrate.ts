/** Narración en español de los eventos de un turno y marcas visuales (quién actuó, quién recibió daño). */
import type { BattleEvent, BattleState, SideId } from "../../packages/core/src/index.ts";
import { cfg } from "./data.ts";

export type Part = string | { readonly n: string; readonly s: SideId };
export interface LogLine {
  readonly kind: "head" | "act" | "dmg" | "heal" | "status" | "ko" | "info" | "end";
  readonly parts: readonly Part[];
}
export interface TurnMarks {
  /** Clave `A1`…`B4`. */
  readonly acted: Set<string>;
  readonly hurt: Map<string, number>;
  readonly healed: Map<string, number>;
  readonly ko: Set<string>;
}

export const key = (side: SideId, pos: number): string => `${side}${pos}`;
const idx = (side: SideId): 0 | 1 => (side === "A" ? 0 : 1);
const STATUS_ES: Record<string, string> = {
  quemadura: "quemadura",
  ralentizar: "ralentizar",
  aturdir: "aturdir",
  marca: "marca",
  debilitar: "debilitar",
  escudo: "escudo",
  prisa: "prisa",
  regenerar: "regenerar",
};
export const statusName = (id: string): string => STATUS_ES[id] ?? id;

/** `before` es el estado previo al turno (equipos y nombres); `names[side][pos-1]` = nombre. */
export function narrate(before: BattleState, events: readonly BattleEvent[], names: readonly [readonly string[], readonly string[]]): { lines: LogLine[]; marks: TurnMarks } {
  const lines: LogLine[] = [];
  const marks: TurnMarks = { acted: new Set(), hurt: new Map(), healed: new Map(), ko: new Set() };
  const nm = (side: SideId, pos: number): Part => ({ n: (names[idx(side)][pos - 1] as string) ?? `${side}${pos}`, s: side });
  const moveName = (side: SideId, pos: number, move: number): string => {
    if (move === 0) return "golpe básico";
    const m = before.teams[idx(side)][pos - 1]?.moves[move - 1];
    return m ? m.name : "movimiento";
  };
  let lastFamily: string | null = null;
  let lastEff: string | null = null;
  const orderLabel = (side: SideId, pos: number): Part[] => [nm(side, pos)];

  for (const e of events) {
    switch (e.type) {
      case "turn":
        lines.push({ kind: "head", parts: [`Turno ${e.turn}`] });
        break;
      case "plan":
        if (!e.valid) lines.push({ kind: "info", parts: [`El plan ${e.side === "A" ? "tuyo" : "rival"} era inválido (${e.reason ?? "?"}): se usan golpes básicos.`] });
        break;
      case "order": {
        const parts: Part[] = ["Orden de actuación: "];
        e.queue.forEach((q, i) => {
          if (i > 0) parts.push(" → ");
          parts.push(...orderLabel(q.side, q.actor));
          if (q.priority > 0) parts.push("*");
        });
        parts.push("  (* = con prioridad)");
        lines.push({ kind: "info", parts });
        break;
      }
      case "action": {
        marks.acted.add(key(e.side, e.actor));
        const mv = e.move === 0 ? null : before.teams[idx(e.side)][e.actor - 1]?.moves[e.move - 1];
        lastFamily = mv ? mv.family : (before.teams[idx(e.side)][e.actor - 1]?.family ?? null);
        lastEff = null;
        const parts: Part[] = [nm(e.side, e.actor), ` usa ${moveName(e.side, e.actor, e.move)}`];
        if (e.targets.length === 0) parts.push(", pero ya no queda objetivo");
        else {
          parts.push(" sobre ");
          e.targets.forEach((t, i) => {
            if (i > 0) parts.push(" y ");
            parts.push(nm(e.targetSide, t));
          });
        }
        lines.push({ kind: "act", parts });
        break;
      }
      case "cancel":
        lines.push({ kind: "info", parts: [nm(e.side, e.actor), e.reason === "aturdido" ? " está aturdido y pierde su acción" : " ya está KO y no actúa", e.refund > 0 ? ` (se le devuelven ${e.refund} de energía)` : ""] });
        break;
      case "lost":
        lines.push({ kind: "info", parts: ["La acción de ", nm(e.side, e.actor), " se pierde: no queda objetivo válido."] });
        break;
      case "damage": {
        const k = key(e.side, e.pos);
        marks.hurt.set(k, (marks.hurt.get(k) ?? 0) + e.amount);
        const tf = before.teams[idx(e.side)][e.pos - 1]?.family;
        let eff = "";
        if (lastFamily && tf) {
          const f = (cfg.combat.families.table[lastFamily] as Record<string, number> | undefined)?.[tf];
          if (f !== undefined && f > 1) eff = " ¡Muy eficaz!";
          else if (f !== undefined && f < 1) eff = " Poco eficaz.";
        }
        const parts: Part[] = [nm(e.side, e.pos), ` recibe ${e.amount} de daño`];
        if (e.absorbed > 0) parts.push(` (el escudo absorbe ${e.absorbed})`);
        parts.push(` y le quedan ${e.hp}.`);
        if (e.condition) parts.push(` ¡Condición cumplida: +${Math.round(cfg.moves.conditions.bonus * 100)} %!`);
        if (eff && eff !== lastEff) parts.push(eff);
        lines.push({ kind: "dmg", parts });
        break;
      }
      case "drain":
        lines.push({ kind: "heal", parts: [nm(e.side, e.pos), ` drena y recupera ${e.amount} de vida (${e.hp}).`] });
        marks.healed.set(key(e.side, e.pos), (marks.healed.get(key(e.side, e.pos)) ?? 0) + e.amount);
        break;
      case "status":
        lines.push({ kind: "status", parts: [nm(e.side, e.pos), ` queda con ${statusName(e.status)}${e.status === "quemadura" ? ` x${e.value}` : ""} (${e.turns} turno${e.turns === 1 ? "" : "s"}).`] });
        break;
      case "immune":
        lines.push({ kind: "status", parts: [nm(e.side, e.pos), ` es inmune a ${statusName(e.status)} por ahora.`] });
        break;
      case "heal":
        marks.healed.set(key(e.side, e.pos), (marks.healed.get(key(e.side, e.pos)) ?? 0) + e.amount);
        lines.push({ kind: "heal", parts: [nm(e.side, e.pos), ` se cura ${e.amount} (vida ${e.hp}).`] });
        break;
      case "shield":
        lines.push({ kind: "heal", parts: [nm(e.side, e.pos), ` gana ${e.amount} de escudo (total ${e.total}).`] });
        break;
      case "energy":
        lines.push({ kind: "info", parts: [`${e.side === "A" ? "Tu bando" : "El rival"} gana ${e.amount} de energía.`] });
        break;
      case "ko":
        marks.ko.add(key(e.side, e.pos));
        lines.push({ kind: "ko", parts: [nm(e.side, e.pos), " cae KO."] });
        break;
      case "burn":
        marks.hurt.set(key(e.side, e.pos), (marks.hurt.get(key(e.side, e.pos)) ?? 0) + e.amount);
        lines.push({ kind: "dmg", parts: ["La quemadura hace ", `${e.amount} de daño a `, nm(e.side, e.pos), ` (vida ${e.hp}).`] });
        break;
      case "regen":
        marks.healed.set(key(e.side, e.pos), (marks.healed.get(key(e.side, e.pos)) ?? 0) + e.amount);
        lines.push({ kind: "heal", parts: [nm(e.side, e.pos), ` regenera ${e.amount} (vida ${e.hp}).`] });
        break;
      case "expire":
        lines.push({ kind: "status", parts: [`Se acaba ${statusName(e.status)} en `, nm(e.side, e.pos), "."] });
        break;
      case "end":
        lines.push({ kind: "end", parts: [e.result === "A" ? "¡Victoria!" : e.result === "B" ? "Derrota." : "Empate."] });
        break;
    }
  }
  return { lines, marks };
}
