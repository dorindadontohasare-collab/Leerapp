export type FormulaEntry = {
  name: string;
  category: string;
  formula: string;
  symbols: string;
  units?: string;
  when: string;
  example: string;
};

/**
 * Statische formulebibliotheek met veelgebruikte formules per vakgebied.
 * Formules die uit documenten worden gehaald verschijnen per document bij de documentanalyse.
 */
export const FORMULA_LIBRARY: FormulaEntry[] = [
  { name: 'Oppervlakte rechthoek', category: 'Wiskunde', formula: 'A = b × h', symbols: 'b = breedte, h = hoogte', units: 'cm², m²', when: 'Oppervlakte van rechthoeken en vierkanten.', example: 'b = 5, h = 4 → A = 20' },
  { name: 'Pythagoras', category: 'Wiskunde', formula: 'c² = a² + b²', symbols: 'c = schuine zijde, a/b = rechthoekszijden', units: 'lengte-eenheid', when: 'Zijde in een rechthoekige driehoek.', example: 'a=3, b=4 → c=5' },
  { name: 'Snelle groeifactor', category: 'Wiskunde', formula: 'N = B × gᵗ', symbols: 'B = beginwaarde, g = groeifactor, t = tijdseenheden', units: 'procent → factor', when: 'Exponentiële groei of afname.', example: '€100 × 1,05⁵ ≈ €127,63' },
  { name: 'Gemiddelde', category: 'Wiskunde', formula: 'x̄ = Σxᵢ / n', symbols: 'x̄ = gemiddelde, n = aantal waarden', units: 'zelfde als xᵢ', when: 'Centrale maat van een reeks getallen.', example: '(4+5+6)/3 = 5' },
  { name: 'Bruto marge', category: 'Economie', formula: 'margebruto = (omzet − inkoopwaarde) / omzet × 100%', symbols: 'omzet, inkoopwaarde', units: '%', when: 'Winstgevendheid per product of bedrijf.', example: 'omzet 200, inkoop 120 → 40%' },
  { name: 'BTW berekenen', category: 'Economie', formula: 'BTW = prijs × tarief', symbols: 'btw-tarief bijv. 21% of 9% (NL)', units: '€', when: 'Invoice berekenen van netto naar bruto.', example: '€100 × 21% = €21 → bruto €121' },
  { name: 'Exclusief BTW terugrekenen', category: 'Economie', formula: 'netto = bruto / (1 + tarief)', symbols: 'bruto incl. btw, tarief als decimaal', units: '€', when: 'Invoice bedragen excl. btw bepalen.', example: '€121 / 1,21 = €100' },
  { name: 'Prijselasticiteit', category: 'Economie', formula: 'E = %ΔQ / %ΔP', symbols: 'Q = gevraagde hoeveelheid, P = prijs', units: 'procenten', when: 'Gevoeligheid van vraag voor prijsveranderingen.', example: 'ΔP +10%, ΔQ −20% → E = −2' },
  { name: 'Inflatie (CPI)', category: 'Economie', formula: 'inflatie = (CPI_t − CPI_t−1) / CPI_t−1 × 100%', symbols: 'CPI = consumptieprijsindex', units: '%', when: 'Prijsstijging over periodes.', example: '110 → 121 = 10%' },
  { name: 'Snelheid', category: 'Natuurkunde', formula: 'v = s / t', symbols: 'v = snelheid, s = afstand, t = tijd', units: 'm/s of km/h', when: 'Constante snelheid.', example: '100 km in 1,5 h ≈ 66,7 km/h' },
  { name: 'Kracht', category: 'Natuurkunde', formula: 'F = m × a', symbols: 'F = kracht, m = massa, a = versnelling', units: 'N = kg·m/s²', when: 'Tweede wet van Newton.', example: '2 kg × 5 m/s² = 10 N' },
  { name: 'Eigen vermogen', category: 'Boekhouden', formula: 'EV = bezittingen − schulden', symbols: 'EV = eigen vermogen', units: '€', when: 'Balanscheck en solvabiliteit.', example: '50.000 − 30.000 = 20.000' },
  { name: 'Winst', category: 'Boekhouden', formula: 'winst = omzet − kosten', symbols: 'omzet, totale kosten', units: '€', when: 'Resultatenrekening per periode.', example: '10.000 − 7.500 = 2.500' },
  { name: 'Chemische reactievergelijking balans', category: 'Scheikunde', formula: 'n(A) = m / M', symbols: 'n = mol, m = massa in g, M = molmassa in g/mol', units: 'mol, g, g/mol', when: 'Stoichiometrische berekeningen.', example: '18 g H₂O / 18 g/mol = 1 mol' }
];
