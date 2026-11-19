"use strict";
/* PartsPlanner · pagina «Come si calcola la probabilità di vendita» (aumento dinamico): distribuzione di Poisson con un esempio */

// P(x) e P(almeno x) con la formula di Poisson
const poisP = (x, l) => { let p = Math.exp(-l); for (let k = 1; k <= x; k++) p *= l / k; return p; };
const poisAlmeno = (x, l) => { let c = 0; for (let k = 0; k < x; k++) c += poisP(k, l); return Math.max(0, 1 - c); };
const pct = v => fmtN(v * 100, 2) + "%";
const dec = (v, d = 4) => fmtN(v, d);
const frac = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;

async function viewProbabilita(main) {
  const vr = 2.14 * 10.32 / 12, M = vr * 12;
  const righeMozzo = [15, 16, 17, 18, 19, 20, 21, 22].map(n => { const p = poisAlmeno(n, M), ok = p >= 0.8;
    return `<tr class="${n === 18 ? "hi" : ""}"><td class="num">${n}°</td><td class="num">${pct(p)}</td><td>${ok ? "sì, è sopra l'80%" : "no, è sotto l'80%"}</td></tr>`; }).join("");
  main.innerHTML = `<div class="head"><div><h1>Come si calcola la probabilità di vendita</h1><p class="sub">L'aumento dinamico usa la <b>distribuzione di Poisson</b>: la formula che descrive eventi che capitano a caso ma con una frequenza media stabile, come le vendite di un ricambio.</p></div></div>
  <section class="panel rules prob"><h3>La formula</h3>
    <p>λ (lambda) è il numero di pezzi che il codice vende in media nel periodo scelto in «Rivendere i pezzi in più entro»:</p>
    <p class="formula">λ = vendita regolare al mese × mesi &nbsp;&nbsp; con &nbsp;&nbsp; vendita regolare = consumo medio × ${frac("regolarità", "12")}</p>
    <p>La formula di Poisson dà la probabilità di vendere esattamente x pezzi nel periodo:</p>
    <p class="formula">P(x) = e<sup>−λ</sup> · ${frac("λ<sup>x</sup>", "x!")}</p>
    <p>«Il pezzo numero N si vende entro il periodo» vuol dire «nel periodo si vendono almeno N pezzi». Si calcola togliendo da 1 i casi con meno di N pezzi venduti:</p>
    <p class="formula">P(almeno N) = 1 − P(0) − P(1) − … − P(N − 1)</p>
    <p>I pezzi si contano partendo da quelli che il codice ha già, cioè giacenza più ordini aperti.</p>
  </section>
  <section class="panel rules prob"><h3>Un esempio con un codice</h3>
    <p>Un mozzo posteriore (dati inventati): consumo medio 2,14 pezzi al mese, regolarità 10,32, giacenza 2, SMax 6. Rivendita entro 12 mesi, probabilità minima di vendita 80%.</p>
    <p class="formula">vendita regolare = 2,14 × ${frac("10,32", "12")} = ${dec(vr, 2)} pezzi al mese</p>
    <p class="formula">λ = ${dec(vr, 2)} × 12 mesi = ${dec(M, 1)} pezzi attesi in 12 mesi</p>
    <p>Per il 18° pezzo a magazzino:</p>
    <p class="formula">P(almeno 18) = 1 − P(0) − P(1) − … − P(17) = ${dec(poisAlmeno(18, M))} = ${pct(poisAlmeno(18, M))}</p>
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
