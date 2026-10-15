// clinical lens: extract fold + RISK_RULES + screenRisk from the source and run them on realistic phrases.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const core = fs.readFileSync(path.join(ROOT, 'src/js/00-core.js'), 'utf8');
const ai = fs.readFileSync(path.join(ROOT, 'src/js/10-ai.js'), 'utf8');
const foldLine = core.split('\n').find((l) => l.startsWith('const fold'));
const start = ai.indexOf('const LEVELS');
const end = ai.indexOf('/* ---------- Envoltura');
const code = foldLine + '\n' + ai.slice(start, end) + '\nreturn { screenRisk, fold };';
const { screenRisk } = new Function(code)();

// [frase, nivel esperado mínimo]
const CASES = [
  // ideación directa
  ['Me quiero matar', 'riesgo_alto'],
  ['ya me quiero ir de aquí para siempre', 'riesgo_alto'],
  ['me quiero aventar', 'riesgo_alto'],
  ['me voy a aventar del puente', 'riesgo_alto'],
  ['no aguanto más esta vida', 'riesgo_alto'],
  ['ya no quiero vivir', 'riesgo_alto'],
  ['YA NO QUIERO VIVIR', 'riesgo_alto'],
  ['ya no kiero vivir', 'riesgo_alto'],
  ['quiero morirme', 'riesgo_alto'],
  ['me quiero morir 😭😭', 'riesgo_alto'],
  ['kiero morirme', 'riesgo_alto'],
  ['quisiera morirme', 'riesgo_alto'],
  ['ojalá me muriera', 'riesgo_alto'],
  ['ojala ya no despertara mañana', 'riesgo_alto'],
  ['quisiera dormirme y no despertar', 'riesgo_alto'],
  ['ya no quiero estar aquí', 'riesgo_alto'],
  ['ya no quiero existir', 'riesgo_alto'],
  ['quiero desaparecer', 'riesgo_alto'],
  ['ya no le encuentro sentido a nada', 'riesgo_alto'],
  ['todos estarían mejor sin mí', 'riesgo_alto'],
  ['todos estarian mejor si yo no estuviera', 'riesgo_alto'],
  ['soy una carga para todos', 'riesgo_alto'],
  ['estoy pensando en suicidarme', 'riesgo_alto'],
  ['pienso en el suicidio', 'riesgo_alto'],
  ['me voy a quitar la vida', 'riesgo_alto'],
  ['voy a acabar con todo esto', 'riesgo_alto'],
  ['quiero acabar con esto de una vez', 'riesgo_alto'],
  ['quiero quitarme la vida', 'riesgo_alto'],
  ['me voy a matar hoy', 'riesgo_alto'],
  ['ya me quiero morir', 'riesgo_alto'],
  ['mejor me muero', 'riesgo_alto'],
  ['me dan ganas de morirme', 'riesgo_alto'],
  ['ya no puedo más, me quiero ir para siempre', 'riesgo_alto'],
  ['me quiero dormir para siempre', 'riesgo_alto'],
  // plan / medios
  ['ya tengo las pastillas guardadas', 'riesgo_alto'],
  ['junté pastillas de mi mamá', 'riesgo_alto'],
  ['me voy a tomar todo el frasco', 'riesgo_alto'],
  ['me tomé todas mis pastillas', 'riesgo_alto'],
  ['compré una soga', 'riesgo_alto'],
  ['tengo la pistola de mi papá en el cuarto', 'riesgo_alto'],
  ['me voy a colgar', 'riesgo_alto'],
  ['me quiero ahorcar', 'riesgo_alto'],
  ['me voy a tirar del edificio', 'riesgo_alto'],
  ['me voy a tirar al metro', 'riesgo_alto'],
  ['me voy a echar a las vías', 'riesgo_alto'],
  ['estoy en la azotea', 'riesgo_alto'],
  ['ya escribí la carta para mi familia', 'riesgo_alto'],
  ['ya decidí cómo lo voy a hacer', 'riesgo_alto'],
  ['esta es mi despedida', 'riesgo_alto'],
  ['gracias por todo, adiós', 'riesgo_alto'],
  ['me tome 20 pastillas', 'riesgo_alto'],
  ['me tomé un bote de clonazepam', 'riesgo_alto'],
  ['tome veneno para ratas', 'riesgo_alto'],
  // autolesión
  ['me corté otra vez', 'riesgo_alto'],
  ['me volví a cortar', 'riesgo_alto'],
  ['me corte los brazos', 'riesgo_alto'],
  ['tengo ganas de cortarme', 'riesgo_alto'],
  ['me estoy haciendo daño', 'riesgo_alto'],
  ['me lastimé a propósito', 'riesgo_alto'],
  ['me rasguñé hasta sangrar', 'riesgo_alto'],
  ['me pegué en la cabeza contra la pared', 'riesgo_alto'],
  ['me quemé con un cigarro', 'riesgo_alto'],
  ['me autolesioné', 'riesgo_alto'],
  ['me hice cortes', 'riesgo_alto'],
  // violencia / terceros
  ['mi esposo me pegó anoche', 'riesgo_alto'],
  ['mi pareja me golpea', 'riesgo_alto'],
  ['mi novio me pega', 'riesgo_alto'],
  ['me pega mi esposo', 'riesgo_alto'],
  ['me amenazó con matarme', 'riesgo_alto'],
  ['tengo miedo de que me mate', 'riesgo_alto'],
  ['tengo ganas de matarlo', 'riesgo_alto'],
  ['lo voy a matar', 'riesgo_alto'],
  ['le voy a hacer daño a mi hijo', 'riesgo_alto'],
  ['tengo miedo de lastimar a mi bebé', 'riesgo_alto'],
  ['abusó de mí', 'riesgo_alto'],
  ['me violaron', 'riesgo_alto'],
  ['mi hermana dice que se quiere matar', 'riesgo_alto'],
  // malestar
  ['tengo un ataque de pánico', 'malestar'],
  ['no puedo dejar de llorar', 'malestar'],
  ['estoy llorando mucho', 'malestar'],
  ['no puedo respirar', 'malestar'],
  ['ya no aguanto', 'malestar'],
  ['estoy muy mal', 'malestar'],
  ['me siento fatal', 'malestar'],
  ['tengo mucha ansiedad', 'malestar'],
  ['ando bien bajoneado', 'malestar'],
  ['me siento de la verga', 'malestar'],
  ['estoy de la chingada', 'malestar'],
  ['no puedo dormir de la angustia', 'malestar'],
  // falsos positivos (deberían ser normal)
  ['me corté el pelo y me gustó', 'normal'],
  ['me corte el fleco', 'normal'],
  ['me corté con una hoja de papel', 'normal'],
  ['compré pastillas para la gripa', 'normal'],
  ['ya me tomé las pastillas para la presión', 'normal'],
  ['me quiero matar de risa jaja', 'normal'],
  ['me muero de hambre', 'normal'],
  ['me muero de sueño', 'normal'],
  ['estoy muerta de cansancio', 'normal'],
  ['el examen me mató', 'normal'],
  ['vi una película de crisis financiera', 'normal'],
  ['ya pasó la crisis, estoy mejor', 'normal'],
  ['quiero aventarme un maratón de series', 'normal'],
  ['me voy a aventar a hacer el examen', 'normal'],
  ['mi perro se tomó veneno de ratas y ya está bien', 'normal'],
  ['el arma secreta para dormir es el té', 'normal'],
  ['ya no quiero vivir con mi mamá', 'normal'],
  ['no quiero seguir aquí en este trabajo', 'normal'],
  ['quiero desaparecer de redes sociales para siempre', 'normal'],
  ['tengo ganas de hacerle daño a alguien... a mi dieta jaja', 'normal'],
  ['mi papá me golpeaba de niño', 'normal'],
  ['me quemé cocinando', 'normal'],
  ['lastimarme la rodilla en el gym fue horrible', 'normal']
];

const results = CASES.map(([t, exp]) => { const r = screenRisk(t); return { t, exp, got: r.nivel, cats: r.categorias.join(',') }; });
const rank = { normal: 0, malestar: 1, riesgo_alto: 2 };
let fn = 0, fp = 0;
for (const r of results) {
  let flag = '';
  if (rank[r.got] < rank[r.exp]) { flag = 'FALSE-NEG'; fn++; }
  else if (r.exp === 'normal' && r.got !== 'normal') { flag = 'FALSE-POS'; fp++; }
  console.log((flag || 'ok').padEnd(10), r.exp.padEnd(12), '->', r.got.padEnd(12), JSON.stringify(r.t), r.cats ? '[' + r.cats + ']' : '');
}
console.log('\nTotal', results.length, 'false negatives', fn, 'false positives', fp);
