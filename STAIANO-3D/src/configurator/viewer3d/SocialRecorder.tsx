"use client";
import { useEffect, useState } from "react";
import { advance, useThree } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import { useCustomerView } from "./customer-view-state";
import {
  restartSocialClock,
  SOCIAL_CLIP_SECONDS,
  socialCaption,
  socialClock,
  socialTime,
} from "./social-shots";
import { SOCIAL_TAGLINE } from "./social-copy";

const WIDTH = 1080;
const HEIGHT = 1920;
const INK = "#183249";
const GREEN = "#3aa64a";
const BLUE = "#365aa8";
/** Nel video compare solo il negozio: il nome del progetto è quello del cliente. */
const SHOP_NAME = "Termoidraulica Staiano";
const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';
/** Schermata finale: logo, nome e invito, sopra la casa che sfuma. */
const END_CARD_SECONDS = 3.2;
/** 60 fotogrammi al secondo: i movimenti di camera restano fluidi anche sui telefoni che li mostrano. */
const FPS = 60;

/** Il video si codifica in MP4 (H.264) con WebCodecs: serve un browser che lo supporti. */
export const clipFormat = () =>
  typeof VideoEncoder === "undefined" ? undefined : "video/mp4";

/** Spezza il testo in righe che stanno entro `max` pixel. */
function wrap(context: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  return line ? [...lines, line] : lines;
}

/** Come `wrap`, ma con righe di lunghezza simile: niente parola orfana sull'ultima riga. */
function balancedWrap(
  context: CanvasRenderingContext2D,
  text: string,
  max: number,
) {
  const lines = wrap(context, text, max);
  let best = lines;
  for (let width = max - 20; width > max / 3; width -= 20) {
    const tighter = wrap(context, text, width);
    if (tighter.length !== lines.length) break;
    best = tighter;
  }
  return best;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (value: number) => 1 - (1 - clamp01(value)) ** 3;
/** Supera appena l'arrivo e ci torna: un rimbalzo leggero per le scritte che entrano. */
const easeOutBack = (value: number) => {
  const t = clamp01(value) - 1;
  return 1 + 2.2 * t ** 3 + 1.2 * t ** 2;
};

/**
 * Crea il video verticale 1080×1920 con didascalie animate, grading e chiusura, poi scarica il file.
 * Non registra lo schermo in tempo reale (un fotogramma lento diventerebbe uno scatto): ferma il ciclo
 * di disegno della scena e la disegna un fotogramma alla volta, a passo fisso, codificando ognuno con
 * il suo istante esatto. Qualunque sia la velocità del PC, il video esce fluido.
 */
export function SocialRecorder({ invite }: { invite: string }) {
  const get = useThree((state) => state.get);
  const canvas = useThree((state) => state.gl.domElement);
  const recording = useCustomerView((state) => state.recording);
  // Si parte a modelli 3D caricati: un apparecchio ancora in arrivo comparirebbe tardi nel video.
  const loading = useProgress((state) => state.active);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!recording) return;
    const timer = setTimeout(() => setReady(true), loading ? 8000 : 400);
    return () => {
      clearTimeout(timer);
      setReady(false);
    };
  }, [recording, loading]);
  useEffect(() => {
    if (!recording || !ready || !clipFormat()) return;
    const output = document.createElement("canvas");
    output.width = WIDTH;
    output.height = HEIGHT;
    const context = output.getContext("2d");
    if (!context) return;
    const state = get();
    const previousDpr = state.viewport.dpr;
    const logo = new Image();
    logo.src = "/logo.svg";
    let cancelled = false;
    const drawLogo = (width: number, x: number, y: number) => {
      if (!logo.naturalWidth) return 0;
      const height = (width * logo.naturalHeight) / logo.naturalWidth;
      context.drawImage(logo, x, y, width, height);
      return height;
    };
    const draw = () => {
      const elapsed = socialTime();
      const captionOn = socialCaption.alpha > 0.01 && !!socialCaption.text;
      // Zoom d'apertura lento: si parte già in movimento, mai da un fotogramma fermo o nero.
      const punch = 1 + 0.08 * (1 - easeOut(elapsed / 2.4));
      const scale =
        Math.max(WIDTH / canvas.width, HEIGHT / canvas.height) * punch;
      const width = canvas.width * scale;
      const height = canvas.height * scale;
      // Grading deciso: la scena chiara del configuratore non deve sembrare slavata.
      context.filter = "contrast(1.14) saturate(1.12) brightness(1.02)";
      context.drawImage(
        canvas,
        (WIDTH - width) / 2,
        (HEIGHT - height) / 2,
        width,
        height,
      );
      context.filter = "none";
      // Vignettatura: bordi più scuri, sguardo al centro.
      const shade = context.createRadialGradient(
        WIDTH / 2,
        HEIGHT / 2,
        HEIGHT * 0.25,
        WIDTH / 2,
        HEIGHT / 2,
        HEIGHT * 0.7,
      );
      shade.addColorStop(0, "rgb(8 18 28 / 0%)");
      shade.addColorStop(1, "rgb(8 18 28 / 42%)");
      context.fillStyle = shade;
      context.fillRect(0, 0, WIDTH, HEIGHT);
      const since = elapsed - (SOCIAL_CLIP_SECONDS - END_CARD_SECONDS);
      const endShare = clamp01(since / 0.8);
      // Sfumo scuro in basso: le didascalie si leggono su qualunque sfondo.
      const floor = context.createLinearGradient(0, HEIGHT * 0.5, 0, HEIGHT);
      floor.addColorStop(0, "rgb(8 18 28 / 0%)");
      floor.addColorStop(1, "rgb(8 18 28 / 70%)");
      context.fillStyle = floor;
      context.fillRect(0, HEIGHT * 0.5, WIDTH, HEIGHT * 0.5);
      // Nessun marchio fisso sopra la scena: distrae e sa di pubblicità. Logo e nome arrivano in chiusura.
      if (captionOn) {
        // Didascalia centrata: riga breve in una pastiglia verde, poi il titolo grande, parola per parola.
        const [kicker, headline] = socialCaption.text.includes("\n")
          ? socialCaption.text.split("\n")
          : ["", socialCaption.text];
        context.save();
        context.font = `900 108px ${FONT}`;
        context.textAlign = "left";
        context.textBaseline = "alphabetic";
        const lines = balancedWrap(context, headline, WIDTH - 160);
        const lineHeight = 120;
        const top = HEIGHT * 0.8 - lines.length * lineHeight;
        if (kicker) {
          context.font = `800 32px ${FONT}`;
          context.letterSpacing = "6px";
          const pillWidth = context.measureText(kicker).width + 56;
          context.globalAlpha =
            socialCaption.alpha * easeOut(socialCaption.age / 0.6);
          context.fillStyle = GREEN;
          context.beginPath();
          context.roundRect(
            (WIDTH - pillWidth) / 2,
            top - 92,
            pillWidth,
            60,
            30,
          );
          context.fill();
          context.fillStyle = "#fff";
          context.textAlign = "center";
          context.fillText(kicker, WIDTH / 2 + 3, top - 50);
          context.letterSpacing = "0px";
          context.textAlign = "left";
          context.font = `900 108px ${FONT}`;
        }
        context.shadowColor = "rgb(0 0 0 / 55%)";
        context.shadowBlur = 28;
        context.fillStyle = "#fff";
        const space = context.measureText(" ").width;
        let word = 0;
        lines.forEach((line, row) => {
          let x = (WIDTH - context.measureText(line).width) / 2;
          const y = top + 96 + row * lineHeight;
          for (const text of line.split(" ")) {
            // Ogni parola sale e si ingrandisce un attimo dopo la precedente.
            const show = easeOutBack(
              (socialCaption.age - 0.25 - word * 0.14) / 0.7,
            );
            const w = context.measureText(text).width;
            if (show > 0) {
              context.save();
              context.globalAlpha = socialCaption.alpha * clamp01(show);
              context.translate(x + w / 2, y + (1 - show) * 30);
              context.scale(0.85 + 0.15 * show, 0.85 + 0.15 * show);
              context.fillText(text, -w / 2, 0);
              context.restore();
            }
            x += w + space;
            word++;
          }
        });
        context.restore();
      }
      if (endShare > 0) {
        // Ogni elemento della chiusura entra un attimo dopo il precedente, con un piccolo rimbalzo.
        const enter = (delay: number) => easeOutBack((since - delay) / 0.9);
        context.save();
        context.globalAlpha = endShare;
        context.fillStyle = "rgb(246 249 251 / 96%)";
        context.fillRect(0, 0, WIDTH, HEIGHT);
        const logoWidth = 520;
        const logoHeight = logo.naturalWidth
          ? (logoWidth * logo.naturalHeight) / logo.naturalWidth
          : 0;
        // Logo e scritte formano un blocco centrato nello schermo, in orizzontale e in verticale.
        const top = (HEIGHT - (logoHeight + 330)) / 2;
        const grow = enter(0.2);
        if (grow > 0) {
          context.save();
          context.translate(WIDTH / 2, top + logoHeight / 2);
          context.scale(grow, grow);
          drawLogo(logoWidth, -logoWidth / 2, -logoHeight / 2);
          context.restore();
        }
        /** Opacità e spostamento verso l'alto di una scritta che entra. */
        const rise = (delay: number) => {
          const value = enter(delay);
          context.globalAlpha = endShare * clamp01(value);
          return (1 - value) * 50;
        };
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillStyle = INK;
        context.font = `900 72px ${FONT}`;
        context.fillText(
          SHOP_NAME,
          WIDTH / 2,
          top + logoHeight + 50 + rise(0.55),
          WIDTH - 140,
        );
        context.font = `600 36px ${FONT}`;
        context.fillStyle = "#5b6f80";
        context.fillText(
          SOCIAL_TAGLINE,
          WIDTH / 2,
          top + logoHeight + 146 + rise(0.75),
          WIDTH - 140,
        );
        // L'invito come un pulsante: è l'unica cosa da fare dopo il video.
        const buttonTop = top + logoHeight + 236 + rise(1);
        context.font = `800 44px ${FONT}`;
        const buttonWidth = Math.min(
          WIDTH - 120,
          context.measureText(invite).width + 96,
        );
        context.fillStyle = BLUE;
        context.beginPath();
        context.roundRect(
          (WIDTH - buttonWidth) / 2,
          buttonTop,
          buttonWidth,
          96,
          48,
        );
        context.fill();
        context.fillStyle = "#fff";
        context.textBaseline = "middle";
        context.fillText(invite, WIDTH / 2, buttonTop + 50, buttonWidth - 60);
        context.restore();
      }
    };
    const finish = () => {
      socialClock.frame = null;
      restartSocialClock();
      state.clock.autoStart = true;
      state.setFrameloop("demand");
      state.setDpr(previousDpr);
      useCustomerView.setState({ recording: false, progress: 0 });
    };
    const record = async () => {
      // Scena a risoluzione nativa: niente ingrandimento di un'immagine piccola.
      state.setDpr(
        Math.max(previousDpr, WIDTH / Math.max(1, state.size.width)),
      );
      await Promise.all([
        document.fonts.load(`900 108px ${FONT}`),
        document.fonts.load(`800 32px ${FONT}`),
        logo.decode().catch(() => undefined),
        // Lascia applicare la nuova risoluzione prima del primo fotogramma.
        new Promise((resolve) => setTimeout(resolve, 200)),
      ]);
      if (cancelled) return;
      const video = new Output({
        format: new Mp4OutputFormat({ fastStart: "in-memory" }),
        target: new BufferTarget(),
      });
      const source = new CanvasSource(output, {
        codec: "avc",
        bitrate: 10_000_000,
      });
      video.addVideoTrack(source, { frameRate: FPS });
      await video.start();
      // Ciclo di disegno fermo: la scena avanza solo quando lo chiediamo, sempre di 1/FPS. Con l'orologio
      // senza avvio automatico, anche flussi d'aria e ventole seguono il tempo del video, non quello reale.
      state.setFrameloop("never");
      state.clock.autoStart = false;
      const frames = Math.round(SOCIAL_CLIP_SECONDS * FPS);
      for (let n = 0; n < frames; n++) {
        if (cancelled) return video.cancel();
        socialClock.frame = n / FPS;
        advance(n / FPS, false);
        // Subito dopo il rendering, quando il buffer WebGL è ancora valido.
        draw();
        await source.add(n / FPS, 1 / FPS);
        if (n % 15 === 0) useCustomerView.setState({ progress: n / frames });
      }
      await video.finalize();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(
        new Blob([video.target.buffer!], { type: "video/mp4" }),
      );
      link.download = "video-staiano.mp4";
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    };
    record()
      .catch((error) => console.error("Video social non creato", error))
      .finally(() => {
        if (!cancelled) finish();
      });
    return () => {
      // Uscita anticipata (Esc, cambio vista): niente file a metà.
      cancelled = true;
      finish();
    };
  }, [recording, ready, canvas, get, invite]);
  return null;
}
