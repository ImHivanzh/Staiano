# Modello di segmentazione planimetrie

`floorplan-unet.onnx` è l'esportazione ONNX del modello
[`Yytsi/floorplan-to-3d-walls`](https://huggingface.co/Yytsi/floorplan-to-3d-walls),
una U-Net con encoder ResNet-34 addestrata su CubiCasa5K.

- Classi: `0` pavimento, `1` muro, `2` porta, `3` finestra.
- Ingresso: `1x3x512x512` float32, letterbox su sfondo `rgb(124,116,104)`,
  normalizzazione ImageNet.
- Uscita: `1x4x512x512` logits.
- SHA-256 del file: `A5994CC885834FF96F108D0811AF6E46DAFB0F8A3CFB300574648771D3BB0828`.
- Pesi originali: `best.safetensors` (97.851.168 byte), SHA-256
  `D7F6A0FD06E2931AECFC8C4849192C5E153701578026EFC78D9A6246731A8D6C`.

L'app usa la maschera semantica delle classi `muro` e `finestra` prima della
vettorizzazione: le finestre chiudono l'involucro esterno, mentre porte e
archi restano aperture e non diventano muri. Il contrasto viene normalizzato
prima dell'inferenza per le scansioni sbiadite.

Licenza del modello: MIT, Copyright (c) 2026 Tuukka Yildirim. Il testo completo
è in `FLOORPLAN-UNET-LICENSE.txt`.
