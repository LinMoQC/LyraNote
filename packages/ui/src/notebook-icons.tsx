import type { FC, SVGProps } from "react";

type IconProps = { size?: number; className?: string } & SVGProps<SVGSVGElement>;
type ColorIcon = FC<IconProps>;

function svg(
  size: number | undefined,
  className: string | undefined,
  props: SVGProps<SVGSVGElement>,
  children: React.ReactNode,
) {
  const s = size ?? 24;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={s} height={s} fill="none" className={className} {...props}>
      {children}
    </svg>
  );
}

const IconBook: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <rect x="3" y="2" width="14" height="20" rx="2" fill="#60a5fa" />
    <rect x="5" y="4" width="10" height="16" rx="1" fill="#dbeafe" />
    <path d="M8 8h4M8 11h6M8 14h3" stroke="#3b82f6" strokeWidth="1.2" strokeLinecap="round" />
    <rect x="17" y="4" width="4" height="16" rx="1" fill="#3b82f6" />
  </>);

const IconFile: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M6 2h8l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" fill="#f9fafb" stroke="#d1d5db" strokeWidth="1" />
    <path d="M14 2v5h5" fill="#e5e7eb" stroke="#d1d5db" strokeWidth="1" strokeLinejoin="round" />
    <path d="M8 12h8M8 15h5" stroke="#6366f1" strokeWidth="1.2" strokeLinecap="round" />
  </>);

const IconFolder: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M2 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" fill="#fbbf24" />
    <path d="M2 10h20v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8z" fill="#f59e0b" />
  </>);

const IconBrain: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M12 2C8 2 5 5.5 5 9c0 2.5 1 4.5 3 6l1 5h6l1-5c2-1.5 3-3.5 3-6 0-3.5-3-7-7-7z" fill="#f9a8d4" />
    <path d="M9 9c1-1 2.5-1 3 0s2 1 3 0" stroke="#ec4899" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    <path d="M9 13c1-1 2.5-1 3 0s2 1 3 0" stroke="#ec4899" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    <path d="M12 4v16" stroke="#ec4899" strokeWidth="1" strokeDasharray="2 2" />
  </>);

const IconLightbulb: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M9 21h6M10 17h4" stroke="#a3a3a3" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z" fill="#fde047" />
    <path d="M12 2a7 7 0 014 12.7V17h-4V2z" fill="#facc15" />
    <circle cx="12" cy="9" r="2" fill="#fefce8" opacity="0.8" />
  </>);

const IconSparkles: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" fill="#a78bfa" />
    <path d="M19 7l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" fill="#c4b5fd" />
    <path d="M5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" fill="#e9d5ff" />
  </>);

const IconCode: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <rect x="2" y="3" width="20" height="18" rx="3" fill="#1e293b" />
    <path d="M8 9l-3 3 3 3" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 9l3 3-3 3" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 7l-2 10" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
  </>);

const IconFlask: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M9 3h6v5l4 10a2 2 0 01-1.8 2.8H6.8A2 2 0 015 18L9 8V3z" fill="#ede9fe" stroke="#8b5cf6" strokeWidth="1" />
    <path d="M6.8 20.8h10.4a2 2 0 001.8-2.8l-2-5H7l-2 5a2 2 0 001.8 2.8z" fill="#c084fc" />
    <circle cx="10" cy="16" r="1" fill="#e9d5ff" />
    <circle cx="14" cy="17" r="0.7" fill="#e9d5ff" />
    <line x1="9" y1="3" x2="15" y2="3" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" />
  </>);

const IconMicroscope: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <circle cx="12" cy="7" r="4" fill="#99f6e4" stroke="#14b8a6" strokeWidth="1.2" />
    <rect x="11" y="11" width="2" height="6" rx="1" fill="#5eead4" />
    <rect x="7" y="19" width="10" height="2" rx="1" fill="#14b8a6" />
    <rect x="10" y="17" width="4" height="2" rx="0.5" fill="#2dd4bf" />
    <circle cx="12" cy="7" r="1.5" fill="#f0fdfa" />
  </>);

const IconRocket: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M12 2c-3 4-4 8-4 12l4 4 4-4c0-4-1-8-4-12z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1" />
    <circle cx="12" cy="11" r="2" fill="#3b82f6" />
    <path d="M5 16l3-2v4l-3 2v-4z" fill="#f97316" />
    <path d="M19 16l-3-2v4l3 2v-4z" fill="#f97316" />
    <path d="M10 18l2 4 2-4" fill="#ef4444" />
  </>);

const IconTarget: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <circle cx="12" cy="12" r="10" fill="#fef2f2" stroke="#fca5a5" strokeWidth="1" />
    <circle cx="12" cy="12" r="7" fill="#fecaca" />
    <circle cx="12" cy="12" r="4" fill="#f87171" />
    <circle cx="12" cy="12" r="1.5" fill="#dc2626" />
  </>);

const IconDiamond: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M12 2l10 9-10 11L2 11l10-9z" fill="#67e8f9" />
    <path d="M12 2l10 9H2l10-9z" fill="#a5f3fc" />
    <path d="M12 2l4 9H8l4-9z" fill="#cffafe" />
    <path d="M12 11l6 0-6 11V11z" fill="#22d3ee" />
  </>);

const IconStar: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M12 2l3 6.5L22 10l-5 5 1.2 7L12 18.5 5.8 22 7 15 2 10l7-.5L12 2z" fill="#fbbf24" />
    <path d="M12 2l3 6.5L22 10l-5 5 1.2 7L12 18.5V2z" fill="#f59e0b" />
  </>);

const IconFlame: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M12 22c-4 0-7-3-7-7 0-3 2-5.5 4-8l3-4 3 4c2 2.5 4 5 4 8 0 4-3 7-7 7z" fill="#fb923c" />
    <path d="M12 22c-2.5 0-4.5-2-4.5-4.5 0-2 1-3.5 2.5-5.5l2-3 2 3c1.5 2 2.5 3.5 2.5 5.5 0 2.5-2 4.5-4.5 4.5z" fill="#fbbf24" />
    <path d="M12 22c-1.2 0-2.2-1-2.2-2.3 0-1 .5-1.8 1.2-2.7l1-1.5 1 1.5c.7.9 1.2 1.7 1.2 2.7 0 1.3-1 2.3-2.2 2.3z" fill="#fef3c7" />
  </>);

const IconZap: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="#facc15" />
    <path d="M13 2l-1 8h7l-9 12 1-8H4L13 2z" fill="none" stroke="#eab308" strokeWidth="1" strokeLinejoin="round" />
  </>);

const IconPalette: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M12 2a10 10 0 000 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4c3 0 5.6-2.5 5.6-5.5C23 5 18.1 2 12 2z" fill="#fef3c7" stroke="#d97706" strokeWidth="0.8" />
    <circle cx="8" cy="10" r="1.8" fill="#ef4444" />
    <circle cx="12" cy="7" r="1.8" fill="#3b82f6" />
    <circle cx="16" cy="10" r="1.8" fill="#22c55e" />
    <circle cx="9" cy="14" r="1.8" fill="#a855f7" />
  </>);

const IconGrad: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M2 10l10-5 10 5-10 5-10-5z" fill="#1e3a5f" />
    <path d="M12 5l10 5-10 5" fill="#2563eb" />
    <rect x="11" y="10" width="2" height="8" fill="#1e3a5f" />
    <path d="M6 18c0-2 3-3 6-3s6 1 6 3" stroke="#1e3a5f" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <circle cx="19" cy="8" r="1.2" fill="#fbbf24" />
    <line x1="19" y1="8" x2="19" y2="14" stroke="#fbbf24" strokeWidth="0.8" />
  </>);

const IconShield: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" fill="#86efac" />
    <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10V2z" fill="#4ade80" />
    <path d="M9 12l2 2 4-4" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </>);

const IconHeart: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A6.04 6.04 0 0116.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#fb7185" />
    <path d="M12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3c-1.74 0-3.41.81-4.5 2.09V21.35z" fill="#f43f5e" />
    <ellipse cx="8.5" cy="8" rx="2" ry="1.5" fill="#fda4af" opacity="0.6" transform="rotate(-30 8.5 8)" />
  </>);

const IconMusic: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <circle cx="7" cy="18" r="3" fill="#a78bfa" />
    <circle cx="17" cy="16" r="3" fill="#c084fc" />
    <rect x="9.5" y="4" width="2" height="14" rx="1" fill="#7c3aed" />
    <rect x="19.5" y="2" width="2" height="14" rx="1" fill="#7c3aed" />
    <rect x="9.5" y="2" width="12" height="4" rx="1" fill="#8b5cf6" />
  </>);

const IconChat: ColorIcon = ({ size, className, ...p }) =>
  svg(size, className, p, <>
    <path d="M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2H8l-4 4V6a2 2 0 012-2z" fill="#93c5fd" />
    <path d="M12 4h8a2 2 0 012 2v9a2 2 0 01-2 2h-8" fill="#60a5fa" />
    <circle cx="8" cy="11" r="1" fill="#dbeafe" />
    <circle cx="12" cy="11" r="1" fill="#dbeafe" />
    <circle cx="16" cy="11" r="1" fill="#dbeafe" />
  </>);

// ── Registry ──────────────────────────────────────────────────────────────────

export interface NotebookIconDef {
  id: string;
  icon: ColorIcon;
  label: string;
}

export const NOTEBOOK_ICONS: NotebookIconDef[] = [
  { id: "book",       icon: IconBook,       label: "Book" },
  { id: "file",       icon: IconFile,       label: "File" },
  { id: "folder",     icon: IconFolder,     label: "Folder" },
  { id: "brain",      icon: IconBrain,      label: "Brain" },
  { id: "lightbulb",  icon: IconLightbulb,  label: "Idea" },
  { id: "sparkles",   icon: IconSparkles,   label: "Sparkles" },
  { id: "code",       icon: IconCode,       label: "Code" },
  { id: "flask",      icon: IconFlask,      label: "Lab" },
  { id: "microscope", icon: IconMicroscope, label: "Research" },
  { id: "rocket",     icon: IconRocket,     label: "Rocket" },
  { id: "target",     icon: IconTarget,     label: "Target" },
  { id: "diamond",    icon: IconDiamond,    label: "Diamond" },
  { id: "star",       icon: IconStar,       label: "Star" },
  { id: "flame",      icon: IconFlame,      label: "Fire" },
  { id: "zap",        icon: IconZap,        label: "Energy" },
  { id: "palette",    icon: IconPalette,    label: "Art" },
  { id: "grad",       icon: IconGrad,       label: "Study" },
  { id: "shield",     icon: IconShield,     label: "Shield" },
  { id: "heart",      icon: IconHeart,      label: "Heart" },
  { id: "music",      icon: IconMusic,      label: "Music" },
  { id: "chat",       icon: IconChat,       label: "Chat" },
];

const ICON_MAP = new Map(NOTEBOOK_ICONS.map((i) => [i.id, i.icon]));

export function getNotebookIcon(id: string | undefined | null): ColorIcon {
  return ICON_MAP.get(id ?? "") ?? IconBook;
}

export function pickDefaultIcon(notebookId: string): string {
  const hash = notebookId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return NOTEBOOK_ICONS[hash % NOTEBOOK_ICONS.length].id;
}
