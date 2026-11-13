/** Comprobación de parches (Q-02/Q-03, R-01) del estudio de combate v0.4. */
import { createRng, generateMoveForKey, runBattle } from "../../packages/core/src/index.ts";
import { BASE, battleConfig, effectiveRaw, GCFG, RAW_COMBAT, RAW_MOVES, readPath, variantSha, wildTeam, type Variant } from "./setup.ts";

/**
 * Lecciones Q-02/Q-03 y R-01: un parche que no cambia la config efectiva no vale, y la forma larga (movimientos)
 * crea claves sin error. Para cada ruta: existe en la base (no se crea), su valor cambia (antes ≠ después) y queda
 * en el pedido; además, la config PARSEADA cambia de verdad (catálogo de movimientos, estadísticas y una partida).
 */
export function checkVariants(vs: readonly Variant[]): void {
  const base = variantSha(BASE);
  const shas = new Set<string>();
  const probe = (v: Variant): string => {
    const cfg = battleConfig(v);
    const rng = createRng("probe|v04");
    const team = wildTeam(rng, cfg, "p");
    const cat = [...GCFG.catalogById.values()].map((t) => generateMoveForKey(`${t.family}|${t.locus}|${t.signature}`, cfg.moves, t.move));
    const rec = runBattle(team, wildTeam(rng, cfg, "q"), "probe|battle", cfg);
    return JSON.stringify([cat, team.map((c) => [c.maxHp, c.attack, c.initiative]), rec.hash, cfg.combat.energy ?? null]);
  };
  const baseProbe = probe(BASE);
  const eff0 = { combat: RAW_COMBAT, moves: RAW_MOVES };
  for (const v of vs) {
    if (v.id === BASE.id) continue;
    const sha = variantSha(v);
    if (sha === base) throw new Error(`la configuración ${v.id} no cambia la config efectiva`);
    if (shas.has(sha)) throw new Error(`la configuración ${v.id} es idéntica a otra`);
    shas.add(sha);
    const e = effectiveRaw(v);
    for (const [kind, ch] of [["combat", v.combat], ["moves", v.moves]] as const)
      for (const [p, x] of Object.entries(ch)) {
        const before = readPath(eff0[kind], p);
        if (before === undefined) throw new Error(`${v.id}: la ruta ${kind}.${p} no existe en la base (errata: el parche la crearía sin efecto)`);
        if (JSON.stringify(before) === JSON.stringify(x)) throw new Error(`${v.id}: ${kind}.${p} ya vale ${JSON.stringify(x)} en la base (parche sin efecto)`);
        if (JSON.stringify(readPath(e[kind], p)) !== JSON.stringify(x)) throw new Error(`${v.id}: ${kind}.${p} no quedó en ${JSON.stringify(x)}`);
      }
    for (const id of Object.keys(v.salts)) if ((RAW_MOVES["overrides_catalogo"].sales as Record<string, unknown>)[id] === undefined && v.salts[id] === null) throw new Error(`${v.id}: la sal ${id} no existe en la base`);
    if (probe(v) === baseProbe) throw new Error(`${v.id}: la config parseada no cambia el catálogo, las estadísticas ni la partida de prueba`);
  }
}

