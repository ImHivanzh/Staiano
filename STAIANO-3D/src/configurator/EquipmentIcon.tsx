const shapes = {
  // Cassa con bocchelli per canali ai lati e ventola al centro.
  plenum: (
    <>
      <rect x="5" y="8" width="14" height="11" rx="1.5" />
      <circle cx="8.5" cy="5" r="1.7" />
      <circle cx="15.5" cy="5" r="1.7" />
      <path d="M2 13.5h3M8.5 6.7V8m7-1.3V8" />
    </>
  ),
  pillar: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="1" />
      <path d="M5 21h14M7 7h10m-10 10h10" />
    </>
  ),
  // Macchina canalizzata: corpo, flange dei canali e ventola.
  machine: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <path d="M2 9h4m-4 6h4m12-6h4m-4 6h4" />
      <circle cx="12" cy="12" r="1" />
      <path d="M12 11V8.5m-.9 3.6-2.2 1.3m3.2-1.3 2.2 1.3" />
    </>
  ),
  // Radiatore a elementi con attacchi laterali.
  radiator: (
    <>
      <rect x="4" y="5" width="16" height="12" rx="2" />
      <path d="M8 5v12m4-12v12m4-12v12M7 17v3m10-3v3M2 8h2m16 8h2" />
    </>
  ),
  // Ventilconvettore a cassetta: pannello quadrato con quattro alette.
  fanCoil: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
      <path d="m3 3 5 5m8 0 5-5M3 21l5-5m8 0 5 5" />
    </>
  ),
  // Split a parete: unità interna con flusso d’aria verso il basso.
  split: (
    <>
      <rect x="2" y="4" width="20" height="9" rx="2" />
      <path d="M5 10h14M7 16c0 1.5 1.5 1.5 1.5 3M12 16c0 1.5 1.5 1.5 1.5 3m3.5-3c0 1.5 1.5 1.5 1.5 3" />
    </>
  ),
  // VRV/VRF: unità esterna con due ventole e linea frigorifera.
  vrv: (
    <>
      <rect x="3" y="2" width="18" height="17" rx="2" />
      <circle cx="12" cy="7.5" r="2.7" />
      <circle cx="12" cy="14" r="2.7" />
      <path d="M12 5v5m-2.5-2.5h5M12 11.5v5m-2.5-2.5h5M7 19v3m10-3v3" />
    </>
  ),
  // Pompa di calore: unità esterna con ventola e simbolo di scambio termico.
  heatPump: (
    <>
      <rect x="3" y="3" width="18" height="16" rx="2" />
      <circle cx="10" cy="11" r="4.5" />
      <path d="M10 11V7.5m0 3.5 3 1.8M10 11l-3 1.8M18 7c1 1 1 2 0 3m0 1c1 1 1 2 0 3M7 19v2m10-2v2" />
    </>
  ),
  // Bocchetta/griglia di mandata con lamelle verticali.
  terminal: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <path d="M7 9v6m3-6v6m3-6v6m3-6v6" />
    </>
  ),
};

export function EquipmentIcon({ type }: { type: keyof typeof shapes }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.7 }}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes[type]}
    </svg>
  );
}
