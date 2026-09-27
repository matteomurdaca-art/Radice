export const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
export const INIZ = ['G','F','M','A','M','G','L','A','S','O','N','D'];

export const TIPI = {
  potatura:    { l: 'Potatura',           c: 'var(--t-potatura)' },
  concime:     { l: 'Concime',            c: 'var(--t-concime)' },
  semina:      { l: 'Semina e impianto',  c: 'var(--t-semina)' },
  irrigazione: { l: 'Acqua',              c: 'var(--t-irrigazione)' },
  protezione:  { l: 'Protezione',         c: 'var(--t-protezione)' },
  raccolta:    { l: 'Raccolta',           c: 'var(--t-raccolta)' },
  trattamento: { l: 'Cura e trattamenti', c: 'var(--t-trattamento)' },
};
export const tipo = t => TIPI[t] || TIPI.trattamento;

export const CATS = [['tutte','Tutte'],['fiori','Fiori'],['arbusti','Arbusti'],['orto','Orto e aromatiche'],['frutti','Frutti'],['interno','Da interno']];

export const GIARDINO = {
  1: ['Pota gli alberi da frutto a riposo nelle giornate senza gelo', 'Controlla le protezioni antigelo', 'Progetta l\'orto e ordina i semi'],
  2: ['A fine mese pota le rose', 'Semina pomodori e peperoni in semenzaio riscaldato', 'Concimazione organica di fondo'],
  3: ['Pota ortensie e agrumi', 'Semina in semenzaio zucchine e basilico', 'Rinvasi e pulizia delle aiuole'],
  4: ['Semina insalate e basilico all\'aperto', 'Metti a dimora arbusti e perenni', 'Primi trattamenti preventivi su rose e alberi da frutto'],
  5: ['Trapianta pomodori e zucchine dopo i Santi di ghiaccio (11-13 maggio)', 'Pacciama le aiuole', 'Togli i fiori appassiti dei rododendri'],
  6: ['Annaffia al mattino presto o la sera', 'Togli le femminelle dei pomodori', 'Raccogli fragole e prime zucchine'],
  7: ['Rinnova la pacciamatura contro la siccità', 'Semina cavoli e finocchi per l\'autunno', 'Talee di ortensia'],
  8: ['Pota la lavanda dopo la fioritura', 'Talee di gerani e rose', 'Impianta le fragole'],
  9: ['Semina o rigenera il prato', 'Trapianta insalate e cavoli', 'A fine mese metti a dimora i bulbi primaverili'],
  10: ['Bulbi di tulipani e narcisi', 'Ritira gerani e agrumi prima delle gelate', 'Raccogli le foglie per il compost'],
  11: ['Metti a dimora alberi e rose a radice nuda', 'Pacciama le piante sensibili', 'Proteggi i vasi dal gelo'],
  12: ['Controlla le piante ricoverate', 'Tessuto non tessuto sulle piante delicate', 'Manutenzione degli attrezzi'],
};

export const ZONE = { nord: 'Nord Italia', centro: 'Centro Italia', sud: 'Sud e isole' };
export const ZONA_NOTE = {
  nord: 'Mesi riferiti al Nord Italia e alla pianura e collina piemontese.',
  centro: 'Al Centro anticipa semine e trapianti di circa 2 settimane e ritira le piante sensibili un po\' più tardi.',
  sud: 'Al Sud e sulle isole anticipa semine e trapianti di 3-4 settimane; molte piante sensibili restano fuori tutto l\'inverno.',
};

export const LIVELLI = [[0,'Germoglio'],[3,'Piantina'],[8,'Giardiniere'],[16,'Pollice verde']];
export const SWATCHES = [['#1E6B52','Verde pino'],['#6E4A8E','Glicine'],['#2C5F8A','Blu lago'],['#8A5A14','Corteccia'],['#A23B3B','Frutti rossi']];
