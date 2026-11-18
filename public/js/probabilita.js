"use strict";
/* PartsPlanner · pagina «Come si calcola la probabilità di vendita» (aumento dinamico): distribuzione di Poisson con due esempi */

// P(x) e P(almeno x) con la formula di Poisson
const poisP = (x, l) => { let p = Math.exp(-l); for (let k = 1; k <= x; k++) p *= l / k; return p; };
const poisAlmeno = (x, l) => { let c = 0; for (let k = 0; k < x; k++) c += poisP(k, l); return Math.max(0, 1 - c); };
const pct = v => fmtN(v * 100, 2) + "%";
const dec = (v, d = 4) => fmtN(v, d);
const frac = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;

async function viewProbabilita(main) {
  const L = 3.6, vr = 2.14 * 10.32 / 12, M = vr * 12;
  const righeDerby = [...Array(9).keys()].map(x => `<tr${x === 4 ? ' class="hi"' : ""}><td class="num">${x}</td><td class="num">${pct(poisP(x, L))}</td><td class="num">${pct(poisAlmeno(x, L))}</td></tr>`).join("");
  const righeMozzo = [15, 16, 17, 18, 19, 20, 21, 22].map(n => { const p = poisAlmeno(n, M), ok = p >= 0.8;
    return `<tr class="${n === 18 ? "hi" : ""}"><td class="num">${n}°</td><td class="num">${pct(p)}</td><td>${ok ? "sì, è sopra l'80%" : "no, è sotto l'80%"}</td></tr>`; }).join("");
  main.innerHTML = `<div class="head"><div><h1>Come si calcola la probabilità di vendita</h1><p class="sub">L'aumento dinamico usa la <b>distribuzione di Poisson</b>: la formula che descrive eventi che capitano a caso ma con una frequenza media stabile, come i gol in una partita, le vittorie in un derby o le vendite di un ricambio.</p></div></div>
  <section class="panel rules prob"><h3>Un esempio con il derby</h3>
    <p>Supponiamo che in un decennio il Milan abbia giocato 20 derby e ne abbia vinti 12.</p>
    <p class="q">Qual è la probabilità che nei prossimi 3 anni vinca almeno 4 derby?</p>
    <h4>Dati</h4>
    <p class="formula">λ = 12 vittorie &nbsp;&nbsp; T = 10 anni (20 derby)</p>
    <p>λ (lambda) è il numero medio di vittorie nel periodo osservato. La domanda però riguarda 3 anni, cioè 3 decimi del decennio: si adegua λ al nuovo periodo.</p>
    <p class="formula">λ′ = ${frac("3", "10")} · 12 = 3,6 vittorie attese in 3 anni</p>
    <h4>Calcoli</h4>
    <p>La formula di Poisson dà la probabilità di avere esattamente x vittorie:</p>
    <p class="formula">P(x) = e<sup>−λ</sup> · ${frac("λ<sup>x</sup>", "x!")}</p>
    <p>Con x = 4 e λ = 3,6:</p>
    <p class="formula">P(4) = e<sup>−3,6</sup> · ${frac("3,6<sup>4</sup>", "4!")} = ${dec(poisP(4, L))} = ${pct(poisP(4, L))}</p>
    <p>«Almeno 4» vuol dire 4, 5, 6 o più. Si calcola più in fretta togliendo da 1 i casi con meno di 4 vittorie:</p>
    <p class="formula">P(almeno 4) = 1 − P(0) − P(1) − P(2) − P(3) = 1 − ${dec(poisP(0, L))} − ${dec(poisP(1, L))} − ${dec(poisP(2, L))} − ${dec(poisP(3, L))} = ${dec(poisAlmeno(4, L))} = ${pct(poisAlmeno(4, L))}</p>
    <p>Il Milan ha quindi circa una possibilità su due di vincere almeno 4 derby nei prossimi 3 anni.</p>
    <div class="tablebox"><table><thead><tr><th class="num">Vittorie in 3 anni</th><th class="num">Esattamente</th><th class="num">Almeno</th></tr></thead><tbody>${righeDerby}</tbody></table></div>
    <p class="small muted">In 3 anni si giocano solo 6 derby e la formula non lo sa: per il derby è un'approssimazione. Per i ricambi questo limite non c'è, perché in un mese si possono vendere quanti pezzi capita.</p>
  </section>
  <section class="panel rules prob"><h3>Dal derby al magazzino</h3>
    <div class="tablebox"><table><thead><tr><th>Nel derby</th><th>Nella piattaforma</th></tr></thead><tbody>
      <tr><td>una vittoria</td><td>un pezzo venduto</td></tr>
      <tr><td>12 vittorie in 10 anni</td><td>la vendita regolare al mese: consumo medio × regolarità ÷ 12</td></tr>
      <tr><td>i prossimi 3 anni</td><td>i mesi scelti in «Rivendere i pezzi in più entro»</td></tr>
      <tr><td>almeno 4 vittorie</td><td>il 4° pezzo a magazzino si vende entro quei mesi</td></tr>
    </tbody></table></div>
    <p>«Il pezzo numero N si vende entro il periodo» vuol dire «nel periodo si vendono almeno N pezzi»: è la colonna «Almeno» della tabella del derby. I pezzi si contano partendo da quelli che il codice ha già, cioè giacenza più ordini aperti.</p>
  </section>
  <section class="panel rules prob"><h3>Un esempio con un codice</h3>
    <p>Un mozzo posteriore (dati inventati): consumo medio 2,14 pezzi al mese, regolarità 10,32, giacenza 2, SMax 6. Rivendita entro 12 mesi, probabilità minima di vendita 80%.</p>
    <p class="formula">vendita regolare = 2,14 × 10,32 ÷ 12 = ${dec(vr, 2)} pezzi al mese</p>
    <p class="formula">λ = ${dec(vr, 2)} × 12 mesi = ${dec(M, 1)} pezzi attesi in 12 mesi</p>
    <div class="tablebox"><table><thead><tr><th class="num">Pezzo a magazzino</th><th class="num">Probabilità di venderlo entro 12 mesi</th><th>Si pianifica?</th></tr></thead><tbody>${righeMozzo}</tbody></table></div>
    <p>Il 18° pezzo ha il ${pct(poisAlmeno(18, M))} di probabilità di essere venduto entro 12 mesi; il 19° solo il ${pct(poisAlmeno(19, M))}, sotto l'80%. Il mozzo ne ha già 2: la piattaforma ne pianifica 16, cioè 4 per arrivare alla SMax e 12 oltre.</p>
  </section>
  <section class="panel rules"><h3>Come la usa la piattaforma</h3><ul>
    <li>Per ogni codice calcola la probabilità di vendere il suo prossimo pezzo entro i mesi scelti.</li>
    <li>Pianifica sempre il pezzo con la probabilità più alta fra tutti i codici, poi ricalcola: per questo sale di più chi vende tanto e con regolarità.</li>
    <li>Si ferma quando finisce l'importo o quando anche il pezzo migliore rimasto è sotto la probabilità minima di vendita: il resto dell'importo non si spende.</li>
    <li>Il calcolo parte dal consumo medio e dalla regolarità delle liste movimentazione (con la stagionalità, se l'hai impostata) e suppone che nei prossimi mesi si venda con la stessa frequenza media del passato.</li>
  </ul></section>`;
}
