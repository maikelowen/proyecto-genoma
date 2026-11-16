/**
 * Carga y validación de `config/mundo.v0.1.json` (spec mundo v0.1 §1, §6.2).
 * Función pura: recibe el JSON ya parseado y la config de progresión; no lee ficheros.
 * Claves desconocidas = error; `presentacion` y los `_doc*` se admiten sin mirar dentro.
 */
import { arr, checkId, dataKeys, fail, int, obj, onlyKeys, str } from "../combat/parse.ts";
import type { ProgressionConfig } from "../progression/config.ts";

export const DIRS = ["n", "e", "s", "o"] as const;
export type Dir = (typeof DIRS)[number];

export interface Tile {
  readonly char: string;
  readonly id: string;
  readonly walkable: boolean;
  /** Probabilidad entera (0..escala) de encuentro por paso que termina aquí. */
  readonly encounterPct: number;
  readonly routeCost: number;
  readonly active: ActivatorKind | null;
}
export type ActivatorKind = "puerta" | "salida";

export interface SpawnPoint {
  readonly x: number;
  readonly y: number;
  readonly facing: Dir;
}
export interface Activator {
  readonly x: number;
  readonly y: number;
  readonly kind: ActivatorKind;
  readonly destination: string;
  readonly zones: readonly string[];
  readonly opensWithZone: string | null;
  readonly closedText: string | null;
}

interface EntityBase {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly facing: Dir | null;
}
export interface CharacterEntity extends EntityBase {
  readonly kind: "personaje";
  readonly character: string;
  readonly noStarterText: string;
  readonly afterTexts: readonly string[];
}
export interface NeighborEntity extends EntityBase {
  readonly kind: "vecino";
  readonly name: string;
  readonly texts: readonly string[];
}
export interface SignEntity extends EntityBase {
  readonly kind: "cartel";
  readonly texts: readonly string[];
}
export interface ObjectEntity extends EntityBase {
  readonly kind: "objeto";
  readonly gives: { readonly faroles: number };
  readonly texts: readonly string[];
  readonly fullText: string;
}
export type WorldEntity = CharacterEntity | NeighborEntity | SignEntity | ObjectEntity;

export interface MapDef {
  readonly id: string;
  readonly zone: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
  /** Casillas en orden de fila (índice = y·ancho + x). */
  readonly cells: readonly Tile[];
  readonly start: SpawnPoint;
  readonly sanctuaryExit: SpawnPoint;
  readonly arrivalFromList: SpawnPoint;
  readonly activators: readonly Activator[];
  readonly entities: readonly WorldEntity[];
}

export interface WorldConfig {
  readonly version: string;
  readonly tiles: Readonly<Record<string, Tile>>;
  readonly movement: {
    readonly msPerStep: number;
    readonly queue: number;
    readonly routeMaxSteps: number;
    readonly dirOrder: readonly Dir[];
    readonly vec: Readonly<Record<Dir, { readonly dx: number; readonly dy: number }>>;
  };
  readonly encounters: {
    readonly flow: string;
    readonly scale: number;
    readonly graceAfterEncounter: number;
    readonly graceLeavingSanctuary: number;
    readonly graceReturningFromList: number;
    readonly maxStepsWithoutEncounter: number;
  };
  readonly maps: readonly MapDef[];
  readonly save: { readonly storageKey: string; readonly format: string; readonly formatVersion: number };
}

const isDir = (s: string): s is Dir => (DIRS as readonly string[]).includes(s);
function dirOf(v: unknown, path: string): Dir {
  const s = str(v, path);
  if (!isDir(s)) fail(path, "se esperaba n, e, s u o");
  return s;
}
function texts(v: unknown, path: string): string[] {
  const l = arr(v, path).map((x, i) => str(x, `${path}[${i}]`));
  if (l.length === 0) fail(path, "lista no vacía");
  return l;
}
function spawn(v: unknown, path: string, w: number, h: number): SpawnPoint {
  const o = obj(v, path);
  onlyKeys(o, ["x", "y", "mira"], path);
  return { x: int(o["x"], `${path}.x`, 0, w - 1), y: int(o["y"], `${path}.y`, 0, h - 1), facing: dirOf(o["mira"], `${path}.mira`) };
}

/** mundo §6.2 — `characterIds`: ids de `progresion.mundo.personajes` (el núcleo de progresión no los conserva); si se omite no se comprueban. */
export function parseWorldConfig(raw: unknown, prog: ProgressionConfig, characterIds?: readonly string[]): WorldConfig {
  const r = obj(raw, "mundo");
  onlyKeys(r, ["version", "depende_de", "casillas", "movimiento", "encuentros", "mapas", "guardado", "validacion_config", "presentacion"], "mundo");
  const version = str(r["version"], "version");
  const dep = obj(r["depende_de"], "depende_de");
  onlyKeys(dep, ["progresion"], "depende_de");
  const m = /\.v(\d+\.\d+)\.json$/.exec(str(dep["progresion"], "depende_de.progresion"));
  if (!m) fail("depende_de.progresion", "se esperaba '<nombre>.vX.Y.json'");
  if (m[1] !== prog.version) fail("depende_de.progresion", `la progresión cargada es v${prog.version}`);

  const vc = obj(r["validacion_config"], "validacion_config");
  onlyKeys(vc, ["regex_ids", "borde_no_pisable", "todo_pisable_alcanzable", "ancho_max", "alto_max"], "validacion_config");
  const idRe = new RegExp(str(vc["regex_ids"], "validacion_config.regex_ids"));
  const borderSolid = vc["borde_no_pisable"] === true;
  const allReachable = vc["todo_pisable_alcanzable"] === true;
  const wMax = int(vc["ancho_max"], "validacion_config.ancho_max", 1);
  const hMax = int(vc["alto_max"], "validacion_config.alto_max", 1);
  const checkIdRe = (s: string, p: string): void => {
    if (!idRe.test(s)) fail(p, `id '${s}' no cumple ${idRe.source}`);
    checkId(s, p);
  };

  // §1.2 leyenda
  const cs = obj(r["casillas"], "casillas");
  const tiles: Record<string, Tile> = {};
  const tileIds = new Set<string>();
  for (const ch of dataKeys(cs)) {
    const p = `casillas.${ch}`;
    if ([...ch].length !== 1) fail(p, "la clave debe ser un solo carácter");
    const t = obj(cs[ch], p);
    onlyKeys(t, ["id", "pisable", "encuentro_pct", "coste_ruta", "activa"], p);
    const id = str(t["id"], `${p}.id`);
    checkIdRe(id, `${p}.id`);
    if (tileIds.has(id)) fail(`${p}.id`, `id repetido '${id}'`);
    tileIds.add(id);
    if (typeof t["pisable"] !== "boolean") fail(`${p}.pisable`, "se esperaba un booleano");
    const walkable = t["pisable"];
    const pct = int(t["encuentro_pct"], `${p}.encuentro_pct`, 0, 100);
    if (pct > 0 && !walkable) fail(`${p}.encuentro_pct`, "solo una casilla pisable tiene encuentros");
    let active: ActivatorKind | null = null;
    if (t["activa"] !== undefined) {
      const a = str(t["activa"], `${p}.activa`);
      if (a !== "puerta" && a !== "salida") fail(`${p}.activa`, "se esperaba puerta o salida");
      if (walkable) fail(`${p}.activa`, "una casilla activa no es pisable");
      active = a;
    }
    const cost = int(t["coste_ruta"], `${p}.coste_ruta`, 0);
    if ((walkable || active !== null) && cost < 1) fail(`${p}.coste_ruta`, "debe ser ≥ 1 en casillas pisables o activas");
    tiles[ch] = Object.freeze({ char: ch, id, walkable, encounterPct: pct, routeCost: cost, active });
  }
  if (Object.keys(tiles).length === 0) fail("casillas", "leyenda vacía");

  // §2 movimiento
  const mv = obj(r["movimiento"], "movimiento");
  onlyKeys(mv, ["ms_por_paso", "cola_entradas", "ruta_max_pasos", "orden_direcciones", "direcciones"], "movimiento");
  const dirOrder = arr(mv["orden_direcciones"], "movimiento.orden_direcciones").map((x, i) => dirOf(x, `movimiento.orden_direcciones[${i}]`));
  if (dirOrder.length !== 4 || new Set(dirOrder).size !== 4) fail("movimiento.orden_direcciones", "debe ser una permutación de n, e, s, o");
  const dv = obj(mv["direcciones"], "movimiento.direcciones");
  onlyKeys(dv, [...DIRS], "movimiento.direcciones");
  const vec = {} as Record<Dir, { dx: number; dy: number }>;
  const seenVec = new Set<string>();
  for (const d of DIRS) {
    const o = obj(dv[d], `movimiento.direcciones.${d}`);
    onlyKeys(o, ["dx", "dy"], `movimiento.direcciones.${d}`);
    const dx = int(o["dx"], `movimiento.direcciones.${d}.dx`, -1, 1);
    const dy = int(o["dy"], `movimiento.direcciones.${d}.dy`, -1, 1);
    if (Math.abs(dx) + Math.abs(dy) !== 1) fail(`movimiento.direcciones.${d}`, "vector unitario (un solo eje)");
    seenVec.add(`${dx},${dy}`);
    vec[d] = { dx, dy };
  }
  if (seenVec.size !== 4) fail("movimiento.direcciones", "vectores repetidos");
  const movement = {
    msPerStep: int(mv["ms_por_paso"], "movimiento.ms_por_paso", 1),
    queue: int(mv["cola_entradas"], "movimiento.cola_entradas", 0),
    routeMaxSteps: int(mv["ruta_max_pasos"], "movimiento.ruta_max_pasos", 1),
    dirOrder,
    vec,
  };

  // §3.2 encuentros
  const en = obj(r["encuentros"], "encuentros");
  onlyKeys(en, ["flujo_rng", "tiradas_por_paso_hierba", "escala_pct", "gracia_tras_encuentro", "gracia_al_salir_santuario", "gracia_al_volver_de_lista", "pasos_max_sin_encuentro"], "encuentros");
  if (en["flujo_rng"] !== "paso") fail("encuentros.flujo_rng", "solo se admite \"paso\" (§3.1)");
  if (en["tiradas_por_paso_hierba"] !== 1) fail("encuentros.tiradas_por_paso_hierba", "solo se admite 1 (§3.1)");
  if (en["escala_pct"] !== 100) fail("encuentros.escala_pct", "solo se admite 100 (§1.2)");
  const encounters = {
    flow: "paso",
    scale: 100,
    graceAfterEncounter: int(en["gracia_tras_encuentro"], "encuentros.gracia_tras_encuentro", 0),
    graceLeavingSanctuary: int(en["gracia_al_salir_santuario"], "encuentros.gracia_al_salir_santuario", 0),
    graceReturningFromList: int(en["gracia_al_volver_de_lista"], "encuentros.gracia_al_volver_de_lista", 0),
    maxStepsWithoutEncounter: int(en["pasos_max_sin_encuentro"], "encuentros.pasos_max_sin_encuentro", 1),
  };

  // §5 guardado
  const gu = obj(r["guardado"], "guardado");
  onlyKeys(gu, ["clave_almacen", "formato", "version_formato", "flujos_rng"], "guardado");
  const flows = arr(gu["flujos_rng"], "guardado.flujos_rng");
  if (flows.length !== 1 || flows[0] !== "paso") fail("guardado.flujos_rng", "debe ser [\"paso\"]");
  const save = {
    storageKey: str(gu["clave_almacen"], "guardado.clave_almacen"),
    format: str(gu["formato"], "guardado.formato"),
    formatVersion: int(gu["version_formato"], "guardado.version_formato", 1),
  };

  // §1.1 mapas
  const zoneIds = new Set(prog.world.zones.map((z) => z.id));
  const mapsRaw = arr(r["mapas"], "mapas");
  if (mapsRaw.length === 0) fail("mapas", "al menos un mapa");
  const maps: MapDef[] = [];
  const mapIds = new Set<string>();
  mapsRaw.forEach((mr, mi) => {
    const p = `mapas[${mi}]`;
    const o = obj(mr, p);
    onlyKeys(o, ["id", "zona", "nombre", "provisional", "ancho", "alto", "filas", "inicio", "salida_santuario", "llegada_desde_lista", "activadores", "entidades"], p);
    const id = str(o["id"], `${p}.id`);
    checkIdRe(id, `${p}.id`);
    if (mapIds.has(id)) fail(`${p}.id`, "mapa repetido");
    mapIds.add(id);
    const zone = str(o["zona"], `${p}.zona`);
    if (!zoneIds.has(zone)) fail(`${p}.zona`, `zona '${zone}' inexistente en progresión`);
    const width = int(o["ancho"], `${p}.ancho`, 1, wMax);
    const height = int(o["alto"], `${p}.alto`, 1, hMax);
    const rows = arr(o["filas"], `${p}.filas`).map((x, i) => str(x, `${p}.filas[${i}]`));
    if (rows.length !== height) fail(`${p}.filas`, `${rows.length} filas ≠ alto ${height}`);
    const cells: Tile[] = [];
    rows.forEach((row, y) => {
      const chars = [...row];
      if (chars.length !== width) fail(`${p}.filas[${y}]`, `longitud ${chars.length} ≠ ancho ${width}`);
      chars.forEach((ch, x) => {
        const t = tiles[ch];
        if (t === undefined) fail(`${p}.filas[${y}]`, `carácter '${ch}' (columna ${x}) fuera de la leyenda`);
        cells.push(t);
      });
    });
    const at = (x: number, y: number): Tile => cells[y * width + x] as Tile;
    if (borderSolid) {
      for (let x = 0; x < width; x++) for (const y of [0, height - 1]) if (at(x, y).walkable) fail(`${p}.filas`, `borde pisable en (${x}, ${y})`);
      for (let y = 0; y < height; y++) for (const x of [0, width - 1]) if (at(x, y).walkable) fail(`${p}.filas`, `borde pisable en (${x}, ${y})`);
    }
    const start = spawn(o["inicio"], `${p}.inicio`, width, height);
    const sanctuaryExit = spawn(o["salida_santuario"], `${p}.salida_santuario`, width, height);
    const arrivalFromList = spawn(o["llegada_desde_lista"], `${p}.llegada_desde_lista`, width, height);

    // activadores
    const activators = arr(o["activadores"], `${p}.activadores`).map((ar, i): Activator => {
      const q = `${p}.activadores[${i}]`;
      const a = obj(ar, q);
      const kind = str(a["tipo"], `${q}.tipo`);
      if (kind !== "puerta" && kind !== "salida") fail(`${q}.tipo`, "se esperaba puerta o salida");
      if (kind === "puerta") onlyKeys(a, ["x", "y", "tipo", "destino"], q);
      else onlyKeys(a, ["x", "y", "tipo", "destino", "zonas", "abre_con_zona", "texto_cerrada"], q);
      const x = int(a["x"], `${q}.x`, 0, width - 1);
      const y = int(a["y"], `${q}.y`, 0, height - 1);
      if (at(x, y).active !== kind) fail(q, `la casilla (${x}, ${y}) '${at(x, y).char}' no es de tipo '${kind}'`);
      const destination = str(a["destino"], `${q}.destino`);
      if (kind === "puerta") {
        if (destination !== "santuario") fail(`${q}.destino`, "la puerta lleva a 'santuario'");
        return { x, y, kind, destination, zones: [], opensWithZone: null, closedText: null };
      }
      if (destination !== "lista_zonas") fail(`${q}.destino`, "la salida lleva a 'lista_zonas'");
      const zones = arr(a["zonas"], `${q}.zonas`).map((z, k) => {
        const zs = str(z, `${q}.zonas[${k}]`);
        if (!zoneIds.has(zs)) fail(`${q}.zonas[${k}]`, `zona '${zs}' inexistente en progresión`);
        return zs;
      });
      if (zones.length === 0) fail(`${q}.zonas`, "lista no vacía");
      const opens = str(a["abre_con_zona"], `${q}.abre_con_zona`);
      if (!zoneIds.has(opens)) fail(`${q}.abre_con_zona`, `zona '${opens}' inexistente en progresión`);
      return { x, y, kind, destination, zones, opensWithZone: opens, closedText: str(a["texto_cerrada"], `${q}.texto_cerrada`) };
    });
    const actKeys = new Set<string>();
    for (const a of activators) {
      if (actKeys.has(`${a.x},${a.y}`)) fail(`${p}.activadores`, `activador repetido en (${a.x}, ${a.y})`);
      actKeys.add(`${a.x},${a.y}`);
    }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (at(x, y).active !== null && !actKeys.has(`${x},${y}`)) fail(`${p}.activadores`, `la casilla activa (${x}, ${y}) no tiene activador`);

    // entidades
    const entities = arr(o["entidades"], `${p}.entidades`).map((er, i): WorldEntity => {
      const q = `${p}.entidades[${i}]`;
      const e = obj(er, q);
      const kind = str(e["tipo"], `${q}.tipo`);
      const common = ["id", "tipo", "x", "y", "mira", "provisional"];
      const base = (): EntityBase => {
        const eid = str(e["id"], `${q}.id`);
        checkIdRe(eid, `${q}.id`);
        const x = int(e["x"], `${q}.x`, 0, width - 1);
        const y = int(e["y"], `${q}.y`, 0, height - 1);
        if (!at(x, y).walkable) fail(q, `la entidad '${eid}' está en una casilla no pisable (${x}, ${y})`);
        return { id: eid, x, y, facing: e["mira"] === undefined ? null : dirOf(e["mira"], `${q}.mira`) };
      };
      switch (kind) {
        case "personaje": {
          onlyKeys(e, [...common, "personaje", "texto_sin_anima", "texto_despues"], q);
          const character = str(e["personaje"], `${q}.personaje`);
          if (characterIds !== undefined && !characterIds.includes(character)) fail(`${q}.personaje`, `personaje '${character}' inexistente en progresión.mundo.personajes`);
          return { ...base(), kind, character, noStarterText: str(e["texto_sin_anima"], `${q}.texto_sin_anima`), afterTexts: texts(e["texto_despues"], `${q}.texto_despues`) };
        }
        case "vecino":
          onlyKeys(e, [...common, "nombre", "texto"], q);
          return { ...base(), kind, name: str(e["nombre"], `${q}.nombre`), texts: texts(e["texto"], `${q}.texto`) };
        case "cartel":
          onlyKeys(e, [...common, "texto"], q);
          return { ...base(), kind, texts: texts(e["texto"], `${q}.texto`) };
        case "objeto": {
          onlyKeys(e, [...common, "da", "texto", "texto_lleno"], q);
          const da = obj(e["da"], `${q}.da`);
          onlyKeys(da, ["faroles"], `${q}.da`);
          return { ...base(), kind, gives: { faroles: int(da["faroles"], `${q}.da.faroles`, 1) }, texts: texts(e["texto"], `${q}.texto`), fullText: str(e["texto_lleno"], `${q}.texto_lleno`) };
        }
        default:
          return fail(`${q}.tipo`, `tipo desconocido '${kind}'`);
      }
    });
    const entIds = new Set<string>();
    const entPos = new Set<string>();
    for (const e of entities) {
      if (entIds.has(e.id)) fail(`${p}.entidades`, `id repetido '${e.id}'`);
      if (entPos.has(`${e.x},${e.y}`)) fail(`${p}.entidades`, `dos entidades en (${e.x}, ${e.y})`);
      entIds.add(e.id);
      entPos.add(`${e.x},${e.y}`);
    }

    // puntos de aparición libres y pisables
    for (const [name, pl] of [["inicio", start], ["salida_santuario", sanctuaryExit], ["llegada_desde_lista", arrivalFromList]] as const) {
      if (!at(pl.x, pl.y).walkable) fail(`${p}.${name}`, `(${pl.x}, ${pl.y}) no es pisable`);
      if (entPos.has(`${pl.x},${pl.y}`)) fail(`${p}.${name}`, `(${pl.x}, ${pl.y}) está ocupada por una entidad`);
    }

    // alcanzabilidad (entidades bloquean, como en el juego)
    const reach = new Uint8Array(width * height);
    const queue: number[] = [start.y * width + start.x];
    reach[queue[0] as number] = 1;
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi] as number;
      const cx = c % width;
      const cy = (c - cx) / width;
      for (const d of DIRS) {
        const nx = cx + vec[d].dx;
        const ny = cy + vec[d].dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (reach[ni] === 1 || !at(nx, ny).walkable || entPos.has(`${nx},${ny}`)) continue;
        reach[ni] = 1;
        queue.push(ni);
      }
    }
    const reachable = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && reach[y * width + x] === 1;
    const hasReachableNeighbor = (x: number, y: number): boolean => DIRS.some((d) => reachable(x + vec[d].dx, y + vec[d].dy));
    if (allReachable) {
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (at(x, y).walkable && !entPos.has(`${x},${y}`) && !reachable(x, y)) fail(`${p}.filas`, `casilla pisable inalcanzable desde el inicio: (${x}, ${y})`);
      }
    }
    for (const e of entities) if (!hasReachableNeighbor(e.x, e.y)) fail(`${p}.entidades`, `la entidad '${e.id}' no tiene casilla vecina alcanzable`);
    for (const a of activators) if (!hasReachableNeighbor(a.x, a.y)) fail(`${p}.activadores`, `el activador (${a.x}, ${a.y}) no tiene casilla vecina alcanzable`);

    maps.push({ id, zone, name: str(o["nombre"], `${p}.nombre`), width, height, rows, cells, start, sanctuaryExit, arrivalFromList, activators, entities });
  });

  return { version, tiles, movement, encounters, maps, save };
}

export function mapById(wcfg: WorldConfig, id: string): MapDef {
  const m = wcfg.maps.find((x) => x.id === id);
  if (m === undefined) throw new Error(`mapa desconocido '${id}'`);
  return m;
}
/** Casilla del mapa; `null` fuera de él. */
export function tileAt(wcfg: WorldConfig, mapId: string, x: number, y: number): Tile | null {
  const m = mapById(wcfg, mapId);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= m.width || y >= m.height) return null;
  return m.cells[y * m.width + x] as Tile;
}
