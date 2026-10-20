const shapes = {
  plenum: (
    <>
      <path d="M6 5h13v14H6l-3-4V9Z" />
      <path d="M19 7h3v3h-3m0 4h3v3h-3M6 5v14M1 10h2m-2 4h2" />
    </>
  ),
  pillar: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="1" />
      <path d="M5 21h14M7 7h10m-10 10h10" />
    </>
  ),
  machine: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M5 8H2v8h3m14-8h3v8h-3" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9v6m-3-3h6" />
    </>
  ),
  radiator: (
    <>
      <rect x="4" y="4" width="16" height="15" rx="2" />
      <path d="M8 4v15m4-15v15m4-15v15M6 19v2m12-2v2M2 8h2m16 7h2" />
    </>
  ),
  fanCoil: (
    <>
      <rect x="3" y="4" width="18" height="15" rx="2" />
      <path d="M6 8h12m-12 3h12m-12 3h8M6 19v2m12-2v2" />
      <circle cx="18" cy="16" r=".6" fill="currentColor" stroke="none" />
    </>
  ),
  split: (
    <>
      <rect x="2" y="5" width="20" height="10" rx="2" />
      <path d="M5 11h14m-13 4v4m6-4v5m6-5v4" />
    </>
  ),
  vrv: (
    <>
      <rect x="2" y="4" width="20" height="12" rx="2" />
      <path d="M5 8h9m-9 3h13m-13 3h7" />
      <circle cx="19" cy="8" r="1.4" />
      <path d="M5 19v2m7-3v3m7-2v2" />
    </>
  ),
  heatPump: (
    <>
      <rect x="3" y="3" width="18" height="17" rx="2" />
      <circle cx="10" cy="11" r="4" />
      <path d="m7 8 6 6m-6 0 6-6m4-2v10M6 20v1m12-1v1" />
    </>
  ),
  terminal: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="1" />
      <path d="M5 8h14M5 11h14M5 14h14M5 17h14" />
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
