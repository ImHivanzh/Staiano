/** All'avvio del server di produzione prepara (o sostituisce) da solo il riconoscitore AI avanzato. */
export async function register() {
  // Né in sviluppo né nel collaudo del pacchetto EXE: scaricherebbero diversi GB a ogni prova.
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.STAIANO_EXE_TEST_PORT
  )
    return;
  const [{ planRecognizerRuntime, recognizerBusy }, { prepareRecognizer }] =
    await Promise.all([
      import("@/services/import/reconstruction-server"),
      import("@/services/import/plan-recognizer-setup"),
    ]);
  // Senza await: register deve finire prima che il server accetti richieste.
  void planRecognizerRuntime()
    .then((runtime) => prepareRecognizer(false, runtime, recognizerBusy()))
    .catch(() => {});
}
