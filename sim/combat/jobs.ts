/**
 * Trabajos del simulador de combate. Cada trabajo es un tramo [from, to) de
 * combates de un escenario y una variante; es determinista (semillas por
 * combate), así que el resultado no depende del nº de hilos ni del orden.
 *
 * Semillas (por combate i):
 *   equipos:  `${seed}|${escenario}|equipos|${i}`   (compartidos entre variantes: pareado)
 *   combate:  `${seed}|${escenario}|${variante}|${i}` (flujo propio por variante)
 */
import {
  createReferenceAi,
  createRng,
  deriveStats,
  eligibleActors,
  generateMoveForKey,
  runBattle,
  withMove,
  type Ai,
  type BattleConfig,
  type BattleRecord,
  type Combatant,
  type FamilyId,
  type Move,
} from "../../packages/core/src/index.ts";
import { atQuality, battleConfig, monoFamilyTeam, qualityExtremes, referenceMove, substitutionSlot, wildCreatures, wildTeam, type Variant } from "./setup.ts";

export type JobKind = "C1" | "C2" | "C3" | "C4" | "MOV";

export interface Job {
  readonly kind: JobKind;
  readonly variant: Variant;
  readonly seed: string;
  readonly from: number;
  readonly to: number;
  /** C2: [F, G]; C4: reserva u; MOV: clave del gen e id; C3: nada (β va en la variante). */
  readonly pair?: readonly [FamilyId, FamilyId];
  readonly reserve?: number;
  readonly moveKey?: string;
  readonly moveId?: string;
  /** Diagnóstico C2: todas las criaturas con el mismo perfil (P = V = R, T = total_ref). */
  readonly equalStats?: boolean;
}

/** Resultado agregado de un trabajo. `xWins` cuenta victorias del bando "X" del escenario. */
export interface JobResult {
  readonly job: Job;
  n: number;
  xWins: number;
  yWins: number;
  draws: number;
  /** Empates por tope de turnos (el resto, por KO mutuo). */
  drawsCap: number;
  aWins: number;
  bWins: number;
  /** Histograma de turnos (índice = turnos). */
  turnsHist: number[];
  /** Acciones: golpes básicos y movimientos por arquetipo. */
  basic: number;
  byArchetype: Record<string, number>;
  /** Informativo de iniciativa: parejas con 0 < Δbase ≤ 5 y misma prioridad; veces que actúa primero la de más base. */
  initPairs: number;
  initHigherFirst: number;
  /** MOV: turnos en que la criatura 1 de X podía pagar m y veces que lo usó. */
  usable: number;
  used: number;
}

function emptyResult(job: Job): JobResult {
  return { job, n: 0, xWins: 0, yWins: 0, draws: 0, drawsCap: 0, aWins: 0, bWins: 0, turnsHist: [], basic: 0, byArchetype: {}, initPairs: 0, initHigherFirst: 0, usable: 0, used: 0 };
}

function tally(r: JobResult, rec: BattleRecord, xIsA: boolean, cfg: BattleConfig, A: readonly Combatant[], B: readonly Combatant[], detail: boolean): void {
  r.n++;
  r.turnsHist[rec.turns] = (r.turnsHist[rec.turns] ?? 0) + 1;
  if (rec.result === "empate") {
    r.draws++;
    if (rec.final.fighters.every((side) => side.some((f) => !f.ko))) r.drawsCap++;
  } else {
    if (rec.result === "A") r.aWins++;
    else r.bWins++;
    if ((rec.result === "A") === xIsA) r.xWins++;
    else r.yWins++;
  }
  if (!detail) return;
  const teams = [A, B];
  for (const turn of rec.log) {
    for (const ev of turn) {
      if (ev.type === "action") {
        if (ev.move === 0) r.basic++;
        else {
          const m = (teams[ev.side === "A" ? 0 : 1] as readonly Combatant[])[ev.actor - 1]!.moves[ev.move - 1]!;
          r.byArchetype[m.archetype] = (r.byArchetype[m.archetype] ?? 0) + 1;
        }
      } else if (ev.type === "order") {
        const q = ev.queue;
        for (let i = 0; i < q.length; i++) {
          for (let j = i + 1; j < q.length; j++) {
            const a = q[i]!;
            const b = q[j]!;
            if (a.side === b.side || a.priority !== b.priority) continue;
            const ia = (teams[a.side === "A" ? 0 : 1] as readonly Combatant[])[a.actor - 1]!.initiative;
            const ib = (teams[b.side === "A" ? 0 : 1] as readonly Combatant[])[b.actor - 1]!.initiative;
            const d = Math.abs(ia - ib);
            if (d === 0 || d > 5) continue;
            r.initPairs++;
            if (ia > ib) r.initHigherFirst++; // a va antes en la cola
          }
        }
      }
    }
  }
  void cfg;
}

/** IA de referencia que además cuenta el uso de un movimiento por la criatura 1 (uso sospechoso, movimientos §7). */
function countingAi(base: Ai, slot: number, cost: number, r: JobResult): Ai {
  return (state, side, cfg) => {
    const plan = base(state, side, cfg);
    const s = side === "A" ? 0 : 1;
    if (eligibleActors(state, side).includes(1) && state.energy[s] >= cost) {
      r.usable++;
      if (plan.some((a) => a.actor === 1 && a.move === slot)) r.used++;
    }
    return plan;
  };
}

export function runJob(job: Job): JobResult {
  const cfg = battleConfig(job.variant);
  const r = emptyResult(job);
  const ref = createReferenceAi();
  const sc = job.kind === "C2" ? `C2|${job.pair![0]}|${job.pair![1]}` : job.kind === "C4" ? `C4|u${job.reserve}` : job.kind === "MOV" ? `MOV|${job.moveKey}` : job.kind;
  // Los equipos de C1/C4/MOV salen del mismo flujo "C1" (mismos equipos para comparar)
  const teamScope = job.kind === "C2" ? sc : job.kind === "C3" ? "C3" : "C1";
  let move: Move | null = null;
  if (job.kind === "MOV") move = generateMoveForKey(job.moveKey!, cfg.moves, job.moveId);
  for (let i = job.from; i < job.to; i++) {
    const trng = createRng(`${job.seed}|${teamScope}|equipos|${i}`);
    const bseed = `${job.seed}|${sc}|${job.variant.id}|${i}`;
    const xIsA = i % 2 === 0; // lados alternos
    let X: Combatant[];
    let Y: Combatant[];
    let aiX: Ai = ref;
    let aiY: Ai = ref;
    switch (job.kind) {
      case "C1": {
        X = wildTeam(trng, cfg, "a");
        Y = wildTeam(trng, cfg, "b");
        // C1: formación por orden de generación; A = primer equipo generado (sin alternar)
        const rec = runBattle(X, Y, bseed, cfg);
        tally(r, rec, true, cfg, X, Y, true);
        continue;
      }
      case "C2":
        X = monoFamilyTeam(job.pair![0], trng, cfg, "x");
        Y = monoFamilyTeam(job.pair![1], trng, cfg, "y");
        if (job.equalStats) {
          const t = cfg.combat.stats.totalRef / 3;
          const eq = (c: Combatant): Combatant => Object.freeze({ ...c, ...deriveStats(t, t, t, cfg.combat) });
          X = X.map(eq);
          Y = Y.map(eq);
        }
        break;
      case "C3": {
        const q = qualityExtremes();
        const cs = wildCreatures(trng, "q");
        X = cs.map((c) => atQuality(c, q.hi, cfg));
        Y = cs.map((c) => atQuality(c, q.lo, cfg));
        break;
      }
      case "C4":
        X = wildTeam(trng, cfg, "a");
        Y = wildTeam(trng, cfg, "b");
        if (!xIsA) [X, Y] = [Y, X]; // el equipo no va ligado a la IA
        aiX = createReferenceAi({ reserve: job.reserve! });
        break;
      case "MOV": {
        const team = wildTeam(trng, cfg, "m");
        const slot = substitutionSlot(team[0]!, move!);
        X = team.slice();
        Y = team.slice();
        X[0] = withMove(team[0]!, slot, move!);
        Y[0] = withMove(team[0]!, slot, referenceMove(move!.cost, move!.family, cfg));
        aiX = countingAi(ref, slot, move!.cost, r);
        break;
      }
    }
    const rec = xIsA ? runBattle(X, Y, bseed, cfg, aiX, aiY) : runBattle(Y, X, bseed, cfg, aiY, aiX);
    tally(r, rec, xIsA, cfg, xIsA ? X : Y, xIsA ? Y : X, false);
  }
  return r;
}

/** Suma resultados del mismo grupo. */
export function merge(rs: readonly JobResult[]): Omit<JobResult, "job"> {
  const out = emptyResult(rs[0]!.job);
  for (const r of rs) {
    out.n += r.n;
    out.xWins += r.xWins;
    out.yWins += r.yWins;
    out.draws += r.draws;
    out.drawsCap += r.drawsCap;
    out.aWins += r.aWins;
    out.bWins += r.bWins;
    out.basic += r.basic;
    out.initPairs += r.initPairs;
    out.initHigherFirst += r.initHigherFirst;
    out.usable += r.usable;
    out.used += r.used;
    r.turnsHist.forEach((c, t) => {
      if (c) out.turnsHist[t] = (out.turnsHist[t] ?? 0) + c;
    });
    for (const [k, v] of Object.entries(r.byArchetype)) out.byArchetype[k] = (out.byArchetype[k] ?? 0) + v;
  }
  const { job: _j, ...rest } = out;
  return rest;
}

/** Trocea n combates en trabajos de tamaño `chunk`. */
export function chunks(base: Omit<Job, "from" | "to">, n: number, chunk: number, offset = 0): Job[] {
  const out: Job[] = [];
  for (let f = 0; f < n; f += chunk) out.push({ ...base, from: offset + f, to: offset + Math.min(n, f + chunk) });
  return out;
}
