/** Comprobación de las configs v0.5 (R-01). Separada de cli.ts para poder importarla en tests. */
import { battleConfig, variantSha, type Variant } from "../v04/setup.ts";

/** Comprobación (R-01): cada config tiene la huella distinta y la config PARSEADA lleva las claves pedidas. */
export function checkV05(vs: readonly Variant[]): void {
  const shas = new Set<string>();
  for (const v of vs) {
    const sha = variantSha(v);
    if (shas.has(sha)) throw new Error(`${v.id} es idéntica a otra config`);
    shas.add(sha);
    const c = battleConfig(v).combat as any;
    const wantPay = v.combat["energia.pago_al_confirmar"];
    const wantLast = v.combat["variantes.ultima_anima.activo"];
    if (c.energy.payOnConfirm !== wantPay || c.variants.lastAnima.active !== wantLast) throw new Error(`${v.id}: la config parseada no lleva los valores pedidos`);
    if (v.combat["variantes.ultima_anima.aturdir"] && c.variants.lastAnima.stun !== v.combat["variantes.ultima_anima.aturdir"]) throw new Error(`${v.id}: aturdir no llegó a la config parseada`);
  }
}
