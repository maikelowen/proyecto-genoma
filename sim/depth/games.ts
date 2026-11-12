/**
 * Partidas de la medida de profundidad: IA con búsqueda contra una IA de reglas,
 * equipos aleatorios espejo (el mismo equipo en los dos lados) y lados alternos.
 * Partida i: equipo `<prefijo>|equipo|⌊i/2⌋`, semilla `<prefijo>|partida|⌊i/2⌋`;
 * la búsqueda juega en A si i es par y en B si es impar (mismo equipo y misma semilla).
 */
import { createReferenceAi, createRng, createSearchAi, runBattle, type Ai, type Plan, type ReferenceAiOptions, type SearchAiOptions } from "../../packages/core/src/index.ts";
import { BASE_VARIANT, battleConfig, wildTeam } from "../combat/setup.ts";

export interface DepthJob {
  readonly prefix: string;
  readonly from: number;
  readonly to: number;
  readonly search: SearchAiOptions;
  readonly rival: ReferenceAiOptions;
}

export interface DepthResult {
  n: number;
  wins: number;
  draws: number;
  turns: number;
  /** Decisiones de la búsqueda y cuántas difieren del plan de la IA de referencia (κ de la config). */
  decisions: number;
  differs: number;
}

const key = (p: Plan): string => p.map((a) => `${a.actor}:${a.move}:${a.target}`).join("|");

export function runDepthJob(job: DepthJob): DepthResult {
  const cfg = battleConfig(BASE_VARIANT);
  const r: DepthResult = { n: 0, wins: 0, draws: 0, turns: 0, decisions: 0, differs: 0 };
  const ref = createReferenceAi();
  const search = createSearchAi(job.search);
  const counted: Ai = (st, side, c) => {
    const p = search(st, side, c);
    r.decisions++;
    if (key(p) !== key(ref(st, side, c))) r.differs++;
    return p;
  };
  const rival = createReferenceAi(job.rival);
  for (let i = job.from; i < job.to; i++) {
    const k = Math.floor(i / 2);
    const team = wildTeam(createRng(`${job.prefix}|equipo|${k}`), cfg, "e");
    const searchIsA = i % 2 === 0;
    const rec = runBattle(team, team, `${job.prefix}|partida|${k}`, cfg, searchIsA ? counted : rival, searchIsA ? rival : counted);
    r.n++;
    r.turns += rec.turns;
    if (rec.result === "empate") r.draws++;
    else if ((rec.result === "A") === searchIsA) r.wins++;
  }
  return r;
}
