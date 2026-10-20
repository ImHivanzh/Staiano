# Ricostruzione locale della planimetria 2D

Raster2Seq propone poligoni delle stanze e aperture. Staiano allinea gli assi ai muri effettivamente riconosciuti nell'immagine, scarta separazioni senza riscontro e conserva i varchi senza evidenza di un'apertura. Il risultato è una bozza 2D modificabile: confermata una quota reale, il programma ricava stanze e superfici con il proprio motore geometrico. Nessuna mesh 3D viene generata dall'AI.

L'immagine passa soltanto al server Staiano autenticato. Il processo Python lavora su una cartella temporanea, eliminata al termine; nessun disegno viene inviato a servizi AI esterni. In assenza del runtime avanzato resta disponibile il riconoscitore nel browser. Quote verticali di porte e finestre sono preliminari (gli stessi valori iniziali dell'editor), da verificare prima dell'utilizzo tecnico.

Installazione server Windows con Python 3.12:

```powershell
.\deploy\setup-plan-recognizer.ps1 -Python 'C:\Python312\python.exe'
```

Il setup isola le dipendenze in `.cache/floorplan-ai`, scarica sorgenti e checkpoint fissati e verifica SHA-256. Il checkpoint occupa 1,45 GB; PyTorch CUDA circa 3 GB scaricati. Su questa postazione è stata verificata la RTX 3070 Ti da 8 GB; il bridge usa CPU quando CUDA non è disponibile. `native/runtime/plan-ai.json` contiene percorsi locali e non va distribuito ad altre postazioni. Il pacchetto EXE include il bridge; il runtime AI si installa sul server che esegue il programma.

Sorgente: [Cornell-VAILab/Raster2Seq](https://github.com/Cornell-VAILab/Raster2Seq), commit `a6c4e27a68d11d7a459f6e4a2601fd887227dd1a`, licenza MIT. Autori: Hao Phung e Hadar Averbuch-Elor, *Raster2Seq: Polygon Sequence Generation for Floorplan Reconstruction*, SIGGRAPH 2026. Checkpoint ufficiale [haopt/Raster2Seq](https://huggingface.co/haopt/Raster2Seq), revisione `c9a9c439ba66594dab701b77b7df52a5f75a5fce`, SHA-256 `f7c0ef9379aa8cf11349da8b2179214e0d495af758383984a2361a1309aab3b7`.

Il bridge usa il riferimento PyTorch della deformable attention distribuito nel progetto (Deformable DETR, Apache-2.0), senza compilare estensioni CUDA. Il checkpoint viene caricato con `weights_only=True`, consentendo soltanto `argparse.Namespace` oltre ai tipi sicuri di PyTorch. Il setup conserva le licenze originali nel sorgente scaricato.
