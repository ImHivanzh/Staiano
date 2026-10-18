---
name: Licenses
description: Console operativa scura per licenze software e postazioni.
colors:
  ground: "#0b111a"
  rail: "#0e1722"
  paper: "#111d2b"
  raised: "#172638"
  ink: "#edf4fc"
  muted: "#a0b3c8"
  blue: "#89baff"
  on-blue: "#0b1b31"
  line: "#293c51"
  green: "#8cdbb7"
  red: "#ffb1b8"
  blue-hover: "#b4d4ff"
  blue-active: "#6aa7fa"
  line-hover: "#4a6582"
  placeholder: "#91a6bf"
  selected-bg: "#183351"
  selected-ink: "#c9e0ff"
  active-bg: "#15372f"
  revoked-bg: "#3d222b"
typography:
  headline:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "30px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
  identifier:
    fontFamily: "ui-monospace, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  status: "4px"
  control: "6px"
  panel: "8px"
  access: "12px"
spacing:
  compact: "6px"
  icon: "8px"
  inline: "12px"
  field: "16px"
  record: "20px"
  panel: "24px"
  section: "28px"
  heading: "32px"
  workspace: "40px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.on-blue}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  button-primary-active:
    backgroundColor: "{colors.blue-active}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.red}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  field:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  nav-current:
    backgroundColor: "{colors.selected-bg}"
    textColor: "{colors.selected-ink}"
    rounded: "{rounded.control}"
    padding: "11px 13px"
  status-active:
    backgroundColor: "{colors.active-bg}"
    textColor: "{colors.green}"
    rounded: "{rounded.status}"
    padding: "3px 7px"
  status-revoked:
    backgroundColor: "{colors.revoked-bg}"
    textColor: "{colors.red}"
    rounded: "{rounded.status}"
    padding: "3px 7px"
  panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "24px"
---

# Design System: Licenses

## Overview

**Creative North Star: "Registro operativo"**

Registro operativo: una console scura e tecnica per leggere e confrontare licenze, software e postazioni. Il fondo navy e le superfici slate organizzano il lavoro; azzurro, verde e rosso comunicano azioni e stati.

La densità resta funzionale: un sans di sistema per i comandi, cifre tabulari per i confronti e monospace per identificativi e chiavi. Il sistema riguarda il pannello Licenses; il tema HVAC rimane indipendente.

**Key Characteristics:**
- Superfici navy e slate delimitate da bordi sottili.
- Comandi leggibili, cifre tabulari e identificativi monospace.
- Record allineati che si ricompongono su tablet e telefono.

## Colors

Navy quasi nero, superfici slate e testo freddo; accenti semanticamente circoscritti.

### Primary

- **Azzurro operativo** (blue): azione primaria, link, focus, caret e icone di identità; blue-hover e blue-active rispondono all'interazione.
- **Inchiostro su azzurro** (on-blue): testo scuro dei pulsanti primari.
- **Selezione navy** (selected-bg / selected-ink): navigazione corrente o pannello espanso.

### Secondary

- **Verde attivo** (green / active-bg): licenze attive e indicatore di sessione.
- **Rosa revoca** (red / revoked-bg): revoca, azione distruttiva ed errore.

### Neutral

- **Fondo navy** (ground), **rail navy** (rail), **superficie slate** (paper) e **slate rialzato** (raised): piani di lavoro e risposta hover.
- **Testo ghiaccio** (ink) e **testo secondario freddo** (muted): gerarchia di contenuto senza abbassare l'opacità del testo.
- **Bordo slate** (line / line-hover): separatori e contorni interattivi.
- **Segnaposto freddo** (placeholder): testo di esempio dei campi, a opacità piena.

**The Action and State Rule.** Azzurro per azione primaria, selezione e focus; verde per stato attivo e rosso per revoca o errore. Accompagnare gli stati con testo.

## Typography

**Body Font:** Segoe UI con fallback system-ui, -apple-system, sans-serif.
**Label/Mono Font:** ui-monospace, Consolas, monospace per identificativi, versioni e chiavi.

**Character:** Sans operativo compatto, pesi moderati e cifre tabulari ereditate dalla radice. I titoli organizzano la console, senza un ruolo display separato.

### Hierarchy

- **Headline:** token headline per titolo pagina; su telefono il titolo dell'elenco scende a (26px). Il titolo di accesso usa (38px), (32px) sotto il breakpoint tablet e (30px) su telefono.
- **Title:** token title per sezioni; identità cliente (15px), peso (600), tracking normale; titolo del pannello di accesso (21px).
- **Body:** token body per lettura e controlli; dati prodotto e testi operativi compatti (13px); testo introduttivo di accesso (16px), interlinea (1.7).
- **Label:** token label per campi; meta e suggerimenti (12px), intestazioni di colonne e badge (11px). I suggerimenti hanno ampiezza massima (75ch).
- **Identifier:** token identifier per ID macchina; versioni (12px), chiave nuova (18px), ridotta a (16px) su telefono. Consentire la spezzatura delle stringhe lunghe.

**The Identifier Rule.** Usare monospace per identificativi, versioni e chiavi; mantenere comandi, titoli e dati cliente nel sans operativo.

## Layout

La console allinea i record in colonne, con spaziatura compatta interna e separazione più ampia tra sezioni. Il ritmo riusa soprattutto field, record, panel, section e heading; le superfici di lavoro usano workspace come margine interno desktop.

L'header sticky misura (76px). La rail fissa misura (228px); l'area autenticata parte dopo la rail e ha larghezza massima (1760px). L'area non autenticata ha massimo (1480px). Il login è una griglia (1.15fr / 1fr) con massimo (960px) e distanza (72px).

I record desktop allineano cliente, software, occupazione, stato e azioni. I filtri usano quattro colonne; le forme di modifica quattro colonne con rapporti (2fr / 1fr / 100px / 1.5fr).

- Sotto (1350px): intestazioni di colonna nascoste, record su tre colonne con azioni nella riga successiva; filtri su due colonne.
- Sotto (1000px): rail (194px), area interna (28px), campi su due colonne; il login riduce la distanza a (36px).
- Sotto (760px): header (64px), margini orizzontali (20px), rail nel flusso con quattro voci orizzontali, record su due colonne e campi su una. Il login diventa una colonna; simbolo e lista introduttiva scompaiono. Le tabelle delle postazioni conservano minimo (570px) con scorrimento locale.
- Con puntatore coarse: pulsanti generici almeno (44px) e navigazione almeno (52px); i controlli con regole locali più specifiche mantengono le misure indicate nei componenti.

## Elevation & Depth

Profondità per toni e bordi, senza ombre sui pannelli ordinari. Header, rail e superfici usano livelli navy distinti. Il messaggio flottante rimane sopra la console, con bordo e ombra morbida.

### Shadow Vocabulary

- **Messaggio flottante:** ombra (`0 10px 30px #0005`), solo per la notifica fissata nell'angolo inferiore.

**The Bordered Surface Rule.** Separare le superfici ordinarie con tono e bordo; riservare l'ombra al messaggio flottante.

## Shapes

Angoli contenuti: status per badge, control per pulsanti, campi e voci di navigazione, panel per contenitori ed editor, access per il pannello di login. Bordi ordinari (1px). Icone SVG lineari con tratto (1.7), estremità e giunzioni arrotondate; icone di comando (18px), marchio (34px). L'indicatore di sessione è un punto pieno circolare (6px).

## Components

### Buttons

Comandi compatti e testuali, primario azzurro e secondari trasparenti con bordo. Altezza minima ordinaria (40px), peso (600); hover e active seguono le varianti dei token. Il secondario passa a raised e line-hover. L'azione distruttiva conserva il fondo del secondario e usa red per testo. Le azioni di riga usano (34px), padding (6px 10px), testo (12px); su telefono altezza (36px), padding orizzontale (8px). Il passkey principale misura almeno (46px) ed è a tutta larghezza.

Transizione di fondo e bordo (150ms), rimossa con prefers-reduced-motion. Focus comune con outline blue (2px) e offset (4px). Disabilitato: opacità (0.55) e cursore wait.

### Chips

Badge di stato compatti: status-active e status-revoked, testo (11px), peso (600), senza bordo. Le parole Attiva e Revocata mantengono il significato indipendente dal colore.

### Cards / Containers

Pannelli paper con bordo line e raggio panel; editor con padding panel, filtri con padding record. Login con raggio access e padding (32px), ridotto a (26px). Su telefono editor e record usano padding (18px). I record condividono un contenitore e separatori orizzontali.

### Inputs / Fields

Campi scuri ground, testo ink, bordo line, raggio control, altezza minima (42px). Hover sul bordo line-hover; placeholder a opacità piena. Focus comune azzurro. Textarea ridimensionabile verticalmente. Il select mantiene il controllo nativo in color-scheme dark.

### Navigation

Voci sans (13px), peso (500), altezza minima (44px), icona e testo con distanza (12px). Muted a riposo; raised e ink al passaggio; selected-bg e selected-ink per corrente o espansa. La variante telefono dispone icona sopra testo (11px), con altezza minima (66px). I link di sezione restano riconoscibili e il collegamento per saltare al contenuto appare al focus.

### Record e postazioni

Cliente in evidenza, riferimento licenza secondario, software, occupazione, stato e azioni nello stesso record. Dettagli contestuali espandibili con tabella; monospace per identificativi tecnici, divisori sottili e scorrimento locale quando necessario. Il pannello chiave usa un trattamento semantico verde dedicato, output selezionabile e conferma testuale di salvataggio.

## Do's and Don'ts

### Do:

- **Do** mantenere il tema scuro tecnico e la lingua italiana.
- **Do** conservare etichette di stato e focus visibile sui controlli.
- **Do** ricomporre i record mantenendo cliente, software, occupazione, stato e azioni riconoscibili.

### Don't:

- **Don't** usare il colore come unico segnale di stato.
- **Don't** estendere il monospace ai testi di interfaccia.
- **Don't** applicare il tema HVAC al pannello Licenses.
