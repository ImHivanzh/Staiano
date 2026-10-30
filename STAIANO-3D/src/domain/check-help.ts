/** Spiegazione e rimedio per ogni codice di controllo mostrato nella vista Controlli. */
export type CheckHelp = { meaning: string; fix: string[] };

const geometry: CheckHelp = {
  meaning:
    "Il contorno della stanza non si chiude o i muri si intersecano in modo anomalo, quindi area e volume non sono affidabili.",
  fix: [
    "Premi «Mostra nel progetto» e guarda gli estremi dei muri evidenziati.",
    "Trascina gli estremi fino a farli coincidere con il muro vicino, oppure elimina i muri doppi.",
    "Quando i muri formano un giro chiuso la stanza torna valida da sola.",
  ],
};
const collision: CheckHelp = {
  meaning: "Due elementi occupano lo stesso spazio fisico.",
  fix: [
    "Premi «Mostra nel progetto» per vedere dove si toccano.",
    "Sposta uno dei due elementi (o cambia la quota) finché non si sovrappongono più.",
    "Per i canali: aggiungi un punto intermedio al percorso e allontanalo dall’ostacolo.",
  ],
};
const envelope: CheckHelp = {
  meaning:
    "L’ingombro completo dell’elemento esce dalla stanza o dalla quota di installazione ammessa.",
  fix: [
    "Premi «Mostra nel progetto» e controlla da quale lato sporge.",
    "Spostalo verso l’interno della stanza o scegli un modello più piccolo.",
    "Se serve spazio sopra, verifica quota controsoffitto e vuoto tecnico.",
  ],
};
const incomplete: CheckHelp = {
  meaning:
    "La macchina o la bocchetta è stata inserita ma la configurazione non è finita: per ora è esclusa da calcoli e computi.",
  fix: [
    "Premi «Mostra nel progetto» per aprire l’apparecchio.",
    "Scegli modello e dati mancanti e conferma.",
    "Se non ti serve più, eliminalo dalla pianta.",
  ],
};
const duct: CheckHelp = {
  meaning:
    "Il percorso del canale ha un problema di collegamento, curva o velocità dell’aria.",
  fix: [
    "Apri Canali della macchina e seleziona il canale segnalato.",
    "Usa «Modifica percorso in 3D» e trascina i punti: curve più larghe, tratti più corti.",
    "Se la velocità è alta, scegli un diametro più grande.",
  ],
};
const noise: CheckHelp = {
  meaning: "Il rumore alla velocità scelta supera il limite.",
  fix: ["Scegli una velocità più bassa o un modello più silenzioso."],
};

export const checkHelp: Record<string, CheckHelp> = {
  walls: {
    meaning: "Qualche muro ha lunghezza o spessore non valido.",
    fix: [
      "Premi «Mostra nel progetto» e seleziona il muro.",
      "Nel pannello Parete correggi lunghezza e spessore (mm).",
      "Elimina i muri di lunghezza zero.",
    ],
  },
  closure: geometry,
  rooms: geometry,
  geometry,
  overlap: {
    meaning: "Due stanze si sovrappongono.",
    fix: [
      "Premi «Mostra nel progetto» e guarda dove si incrociano.",
      "Sposta il muro in comune o ridisegna una delle due stanze.",
      "Per stanze affiancate usa «Aggiungi stanza adiacente».",
    ],
  },
  scale: {
    meaning:
      "La scala della planimetria importata non è confermata: le misure potrebbero essere sbagliate.",
    fix: [
      "Apri la planimetria e usa Ricalibra scala.",
      "Clicca due punti di cui conosci la distanza e scrivila.",
    ],
  },
  recognitionPending: {
    meaning:
      "Il riconoscimento ha proposto muri o porte che non hai ancora confermato.",
    fix: ["Apri l’importazione, controlla gli elementi e premi Conferma."],
  },
  wizardPending: {
    meaning: "La verifica guidata non è completata. Puoi lavorare comunque.",
    fix: [
      "Riapri la verifica guidata e completa i passaggi, oppure ignora l’avviso.",
    ],
  },
  name: {
    meaning:
      "La stanza non ha un nome: nei computi e nel dossier comparirà «Senza nome».",
    fix: ["Selezionala e scrivi il nome nel pannello Stanza."],
  },
  openingDimensions: {
    meaning: "Porta o finestra più grande della parete su cui è posta.",
    fix: [
      "Seleziona la parete e apri Porte e finestre.",
      "Riduci larghezza o altezza, oppure spostala per stare dentro la parete.",
    ],
  },
  openingElevation: {
    meaning:
      "La quota di porta o finestra non è coerente con l’altezza della stanza.",
    fix: [
      "Apri Porte e finestre sulla parete e correggi altezza da terra e altezza.",
    ],
  },
  ceilingBand: {
    meaning: "Una fascia del controsoffitto esce dalla parete o dalla stanza.",
    fix: [
      "Seleziona la stanza e apri Controsoffitto a livelli.",
      "Riduci lunghezza o larghezza della fascia, o la distanza dall’inizio parete.",
    ],
  },
  "equipment-incomplete": incomplete,
  "heat-pump-incomplete": incomplete,
  "ducted-incomplete": incomplete,
  systemConfiguration: {
    meaning: "La stanza non ha ancora un impianto completo.",
    fix: [
      "Seleziona la stanza e scegli il tipo di impianto.",
      "Inserisci gli apparecchi, oppure escludi la stanza dalla climatizzazione se non serve.",
    ],
  },
  excludedRoomEquipment: {
    meaning:
      "La stanza è esclusa dalla climatizzazione ma ha ancora apparecchi collegati.",
    fix: [
      "Scollega o elimina gli apparecchi, oppure riattiva la climatizzazione della stanza.",
    ],
  },
  power: {
    meaning: "La potenza installata non copre il fabbisogno della stanza.",
    fix: [
      "Aggiungi un apparecchio o scegline uno più potente fino a coprire il fabbisogno.",
    ],
  },
  hydronicCheck: {
    meaning: "Il circuito idronico non rispetta un limite del costruttore.",
    fix: [
      "Leggi il messaggio per capire quale limite, poi cambia modello o condizioni dell’acqua.",
    ],
  },
  deviceCollision: collision,
  ductCollision: collision,
  pillarCollision: collision,
  pillarOverlap: collision,
  deviceEnvelope: envelope,
  plenumEnvelope: envelope,
  ductEnvelope: envelope,
  pillarEnvelope: envelope,
  placement: {
    meaning: "L’apparecchio non è posizionato dentro la stanza.",
    fix: ["Selezionalo e trascinalo dentro i muri della stanza."],
  },
  dimensions: {
    meaning: "L’ingombro dell’apparecchio non entra nella parete scelta.",
    fix: ["Spostalo lungo la parete o scegli un modello più stretto."],
  },
  fanCoilCeiling: {
    meaning:
      "Il ventilconvettore non ha abbastanza spazio sopra: quota del corpo, soffitto o vuoto tecnico.",
    fix: [
      "Abbassa il controsoffitto o alza la quota di posa.",
      "Oppure scegli una versione più bassa.",
    ],
  },
  fanCoilNoise: noise,
  noise,
  fanCoilControl: {
    meaning:
      "Comando e scheda scelti non sono abbinabili secondo il costruttore.",
    fix: [
      "Cambia il comando o la scheda scegliendo una coppia indicata nel catalogo.",
    ],
  },
  linearMeters: {
    meaning:
      "I metri lineari di bocchette installati non coprono quelli richiesti.",
    fix: [
      "Aggiungi bocchette o scegline di più lunghe fino ad avere margine positivo.",
    ],
  },
  terminalCapacity: {
    meaning: "La bocchetta non basta per la portata richiesta dalla stanza.",
    fix: ["Aumenta il numero o la taglia delle bocchette."],
  },
  returnAirflow: {
    meaning: "La portata di ripresa non è coerente con quella di mandata.",
    fix: ["Aggiungi o ingrandisci le bocchette di ripresa."],
  },
  machinePlenumMissing: {
    meaning: "La macchina non ha il plenum collegato.",
    fix: ["Crea il plenum della macchina e collegalo con il canale."],
  },
  machinePlenums: {
    meaning: "I plenum della macchina non sono collegati correttamente.",
    fix: ["Controlla gli stacchi del plenum e collegali con i canali."],
  },
  plenumConnections: {
    meaning: "Mancano o sono errati i collegamenti del plenum.",
    fix: ["Selezionalo e collega ogni stacco a un canale."],
  },
  plenumDimensions: {
    meaning: "Il plenum non entra nello spazio disponibile.",
    fix: ["Riduci le dimensioni del plenum o spostalo."],
  },
  terminalConnection: {
    meaning: "La bocchetta non è collegata alla sua macchina.",
    fix: [
      "Usa lo strumento Canale (K): clicca il plenum della bocchetta, poi la macchina.",
    ],
  },
  ductConnection: {
    meaning: "Il canale non è collegato a una macchina o a un plenum.",
    fix: [
      "Rigenera i percorsi proposti o ricollega il canale con lo strumento Canale (K).",
    ],
  },
  ductAirVelocity: duct,
  ductBendRadius: duct,
  terminalCorner: {
    meaning: "La bocchetta è troppo vicina a uno spigolo.",
    fix: ["Spostala lungo la parete, lontano dall’angolo."],
  },
  terminalWall: {
    meaning: "La bocchetta non poggia su una parete valida.",
    fix: ["Selezionala e riposizionala su una parete della stanza."],
  },
  terminalOpening: {
    meaning: "La bocchetta cade sopra una porta o una finestra.",
    fix: ["Spostala dove la parete è piena."],
  },
  terminalDepth: {
    meaning:
      "La profondità della bocchetta non entra nella controparete o nel soffitto.",
    fix: [
      "Aumenta la profondità della controparete o scegli una bocchetta meno profonda.",
    ],
  },
};

export const genericHelp: CheckHelp = {
  meaning: "Il controllo ha trovato un valore da verificare.",
  fix: [
    "Premi «Mostra nel progetto», se disponibile, per vedere l’elemento.",
    "Correggi il dato indicato nel messaggio e controlla che l’avviso sparisca.",
  ],
};
