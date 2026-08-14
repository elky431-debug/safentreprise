/**
 * Jeu d'icônes minimal (traits 1.5px, grille 24) utilisé par la navigation.
 */
type IconProps = {
  className?: string;
};

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconDashboard({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 13h6v7H4zM4 4h6v5H4zM14 4h6v11h-6zM14 19h6v1h-6z" />
    </svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M15.5 20v-1.5a3.5 3.5 0 0 0-3.5-3.5H7a3.5 3.5 0 0 0-3.5 3.5V20" />
      <circle cx="9.5" cy="8" r="3.2" />
      <path d="M17 15.2a3.5 3.5 0 0 1 3.5 3.3V20M15.8 5.2a3.2 3.2 0 0 1 0 5.6" />
    </svg>
  );
}

export function IconCampaign({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 9.5 19 4v14L4 13.5z" />
      <path d="M8 12.2V19a1.5 1.5 0 0 0 3 0v-5.6" />
    </svg>
  );
}

export function IconLogout({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14 20H6a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 6 4h8" />
      <path d="M16 15.5 19.5 12 16 8.5M19.5 12H10" />
    </svg>
  );
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />
    </svg>
  );
}

export function IconUpload({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 15.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" />
      <path d="M12 15V4M8 8l4-4 4 4" />
    </svg>
  );
}

export function IconMail({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </svg>
  );
}

export function IconSms({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="6.5" y="3" width="11" height="18" rx="2.5" />
      <path d="M10.5 18h3" />
    </svg>
  );
}

export function IconRefresh({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v3.5h-3.5" />
    </svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconPencil({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 19.5h4L20 8a2.1 2.1 0 0 0-3-3L5.5 16.5z" />
      <path d="M15.5 6.5 18.5 9.5" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

export function IconPanelLeft({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 5.5h16M4 12h16M4 18.5h16" />
      <path d="M9 8.5 5.5 12 9 15.5" />
    </svg>
  );
}

export function IconPanelRight({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 5.5h16M4 12h16M4 18.5h16" />
      <path d="M15 8.5 18.5 12 15 15.5" />
    </svg>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 7h15M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M6.5 7l.8 11.6A1.5 1.5 0 0 0 8.8 20h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    </svg>
  );
}

export function IconSettings({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.1l1.6 1.5M17.5 15.4l1.6 1.5M3.5 12h2.2M18.3 12h2.2M4.9 16.9l1.6-1.5M17.5 8.6l1.6-1.5" />
    </svg>
  );
}

export function IconTemplates({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 12.5h8M8 16h5" />
    </svg>
  );
}

export function IconFormation({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 9.5 12 5l8.5 4.5L12 14 3.5 9.5z" />
      <path d="M7 12v4.2c0 .8 2.2 2.3 5 2.3s5-1.5 5-2.3V12" />
      <path d="M20.5 9.5V15" />
    </svg>
  );
}

export function IconCertificate({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
      <path d="M9 9h6M9 12.5h6M9 16h3.5" />
    </svg>
  );
}

export function IconHelp({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.8 9.2a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.2.9-1.2 1.8" />
      <path d="M12 16.8v.2" />
    </svg>
  );
}

/** Facturation / paiements. */
export function IconBilling({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M7 14h3.5" />
    </svg>
  );
}

export function IconDeliverability({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7.5h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M4 7.5 12 13l8-5.5" />
    </svg>
  );
}

/* --------------------------------------------------------------------------
   Landing — triptyque tester / former / protéger
   -------------------------------------------------------------------------- */

/** Cible : phase de test (simulation). */
export function IconTarget({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Bouclier validé : phase de protection (extension). */
export function IconShieldCheck({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3 19 5.7v5.6c0 4.1-2.9 7.6-7 8.7-4.1-1.1-7-4.6-7-8.7V5.7L12 3Z" />
      <path d="M9 12.1l2.1 2.1 4-4.2" />
    </svg>
  );
}

/** Triangle d'alerte : bannière de détection. */
export function IconAlertTriangle({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 4.2 2.9 19.3h18.2L12 4.2Z" />
      <path d="M12 10v4M12 16.7v.2" />
    </svg>
  );
}

/** Pièce de puzzle : extension navigateur. */
export function IconPuzzle({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10.3 4.2a1.8 1.8 0 0 1 3.4 0c0 .5-.2.9-.4 1.3h3.2a1 1 0 0 1 1 1v3.2c.4-.3.8-.4 1.3-.4a1.8 1.8 0 0 1 0 3.4c-.5 0-.9-.2-1.3-.4v3.2a1 1 0 0 1-1 1h-3.2c.2.4.4.8.4 1.3a1.8 1.8 0 0 1-3.4 0c0-.5.2-.9.4-1.3H7.5a1 1 0 0 1-1-1v-3.2c-.4.2-.8.4-1.3.4a1.8 1.8 0 0 1 0-3.4c.5 0 .9.1 1.3.4V6.5a1 1 0 0 1 1-1h3.2c-.2-.4-.4-.8-.4-1.3Z" />
    </svg>
  );
}

/** Œil : surveillance en temps réel. */
export function IconEye({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2.5 12S5.9 6.5 12 6.5 21.5 12 21.5 12 18.1 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}
