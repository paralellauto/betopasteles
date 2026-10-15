// Regression: runs the clinical reviewer's phrase table plus misspelling variants against screenRisk.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const core = fs.readFileSync(path.join(ROOT, 'src/js/00-core.js'), 'utf8');
const ai = fs.readFileSync(path.join(ROOT, 'src/js/10-ai.js'), 'utf8');
const foldLine = core.split('\n').find((l) => l.startsWith('const fold'));
const code = foldLine + '\n' + ai.slice(ai.indexOf('const LEVELS'), ai.indexOf('/* ---------- Envoltura')) + '\nreturn { screenRisk };';
const { screenRisk } = new Function(code)();
const src = fs.readFileSync(path.join(ROOT, 'test/clinical-screenrisk.mjs'), 'utf8');
const CASES = new Function(src.slice(src.indexOf('const CASES'), src.indexOf('];', src.indexOf('const CASES')) + 2) + '\nreturn CASES;')();
const VARIANTS = ['me kiero matar','me qiero morir','m quiero matar','me quiero matarrr','suisidarme','me quiero suisidar','ME QUIERO MATAR!!!','me quiero matar😔','ojala q me muera','ojalá me muera','no quiero despertar mañana','me quiero cortar','me voy a cortar las venas','me corte las venas','me quiero morir.','quiero morir','me quiero ir para siempre','me voy a suicidar','voy a acabar con mi vida','me voy a quitar la vida','pense en tirarme del puente','me quiero tirar del puente','me quiero lanzar al metro','tengo un cuchillo en la mano','me estoy cortando ahorita','estoy sangrando','se quiere matar mi amiga','me tomé el frasco de pastillas', 'Ya no quiero vivir, tengo las pastillas', 'ya decidí cómo lo voy a hacer, me voy a colgar esta noche', 'me voy a aventar del puente', 'me kiero morir', 'quisiera morirme', 'mi pareja me golpea'].map((t) => [t, 'riesgo_alto']);
const ROUND2 = ['ya no quiero seguir con mi vida', 'no quiero seguir con mi vida', 'ya no quiero vivir con la depresión', 'no quiero vivir con mis pensamientos', 'no quiero vivir con este dolor', 'tengo ganas de lastimarme la muñeca', 'me corté el dedo a propósito', 'me corté con un vidrio a propósito', 'voy a aventarme las pastillas', 'me voy a aventar el frasco de pastillas', 'quiero aventarme todas las pastillas', 'me lastimé la mano a propósito', 'me quemé con la plancha a propósito', 'me voy a matar de hambre, ya no como'].map((t) => [t, 'riesgo_alto']);
const EXTRA_BENIGN2 = ['ya no quiero vivir con mi mamá', 'no quiero seguir en este trabajo', 'me lastimé la rodilla jugando', 'quiero aventarme una serie completa'].map((t) => [t, 'normal']);
const EXTRA_BENIGN = ['no he tenido ninguna crisis, gracias', 'me voy a echar una siesta', 'me voy a echar a dormir', 'ya me quiero ir a mi casa', 'ya no puedo ir el lunes', 'me pega el sol en la ventana', 'tomé mis pastillas de la presión', 'abusó de mi confianza', 'me muero de ganas de verte', 'me quiero morir de la vergüenza jaja'].map((t) => [t, 'normal']);
const rank = { normal: 0, malestar: 1, riesgo_alto: 2 };
let fn = 0, fpAlto = 0, fpMal = 0;
const out = [];
for (const [t, exp] of CASES.concat(VARIANTS, ROUND2, EXTRA_BENIGN, EXTRA_BENIGN2)) {
  const r = screenRisk(t);
  if (rank[r.nivel] < rank[exp]) { fn++; out.push('FALSE-NEG ' + exp + ' -> ' + r.nivel + ' ' + JSON.stringify(t)); }
  else if (exp === 'normal' && r.nivel === 'riesgo_alto') { fpAlto++; out.push('FP-ALTO   ' + JSON.stringify(t) + ' [' + r.categorias + ']'); }
  else if (exp === 'normal' && r.nivel === 'malestar') { fpMal++; out.push('fp-mal    ' + JSON.stringify(t) + ' [' + r.categorias + ']'); }
}
console.log(out.join('\n'));
console.log('total', CASES.length + VARIANTS.length + ROUND2.length + EXTRA_BENIGN.length + EXTRA_BENIGN2.length, 'falseNeg', fn, 'falsePosAlto', fpAlto, 'falsePosMalestar', fpMal);
process.exitCode = fn ? 1 : 0;
