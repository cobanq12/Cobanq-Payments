/**
 * Design tokens — the single source of truth for colours, spacing, radius and type.
 * Read by tailwind.config.ts (web) and importable unchanged by the React Native app.
 * No DOM, no Tailwind imports here.
 */

export const brand = {
  /** Primary brand colour: the navy of the Cobanq logo. */
  primary: '#000031',
  /** Accent brand colour. */
  accent: '#1FB6A6',
} as const;

export interface ThemeColors {
  canvas: string;
  surface: string;
  subtle: string;
  line: string;
  strong: string;
  ink: string;
  muted: string;
  primary: string;
  primaryHover: string;
  primaryFg: string;
  accent: string;
  accentFg: string;
  accentText: string;
  accentSoft: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  info: string;
  infoBg: string;
  sidebar: string;
  sidebarFg: string;
  sidebarActive: string;
  focus: string;
}

/** All text/background pairs below meet WCAG 2.2 AA (4.5:1 for text, 3:1 for UI). */
export const themes: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    canvas: '#F5F7FA',
    surface: '#FFFFFF',
    subtle: '#EEF2F7',
    line: '#DDE3EC',
    strong: '#8793A6',
    ink: '#0F1B2D',
    muted: '#556275',
    primary: brand.primary,
    primaryHover: '#1A1A5C',
    primaryFg: '#FFFFFF',
    accent: brand.accent,
    accentFg: '#06201D',
    accentText: '#0B7468',
    accentSoft: '#E3F6F3',
    success: '#166534',
    successBg: '#E8F6EC',
    warning: '#92400E',
    warningBg: '#FEF4E0',
    danger: '#B42318',
    dangerBg: '#FDECEA',
    info: '#1D4ED8',
    infoBg: '#E8F0FE',
    sidebar: brand.primary,
    sidebarFg: '#C7D2E3',
    sidebarActive: '#1D2064',
    focus: '#0B7468',
  },
  dark: {
    canvas: '#0A1220',
    surface: '#111B2E',
    subtle: '#18243A',
    line: '#26344D',
    strong: '#5B6B88',
    ink: '#EEF2F8',
    muted: '#A3B0C4',
    primary: '#2CC7B6',
    primaryHover: '#4DD6C7',
    primaryFg: '#06201D',
    accent: brand.accent,
    accentFg: '#06201D',
    accentText: '#4DD6C7',
    accentSoft: '#0F2F30',
    success: '#4ADE80',
    successBg: '#0F2A1B',
    warning: '#FBBF24',
    warningBg: '#2E2208',
    danger: '#F97066',
    dangerBg: '#331513',
    info: '#7CB0FF',
    infoBg: '#12213F',
    sidebar: '#000031',
    sidebarFg: '#C7D2E3',
    sidebarActive: '#1D2064',
    focus: '#4DD6C7',
  },
};

/** 8-px spacing grid (values in px). */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48, '3xl': 64 } as const;

export const radius = { sm: 6, md: 8, lg: 12, xl: 16, full: 9999 } as const;

export const fontFamily = {
  sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
} as const;

/** [font-size px, line-height px] */
export const fontSize = {
  xs: [12, 16],
  sm: [14, 20],
  base: [16, 24],
  lg: [18, 28],
  xl: [20, 28],
  '2xl': [24, 32],
  '3xl': [30, 36],
  '4xl': [36, 40],
} as const;

export const fontWeight = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

export const tokens = { brand, themes, spacing, radius, fontFamily, fontSize, fontWeight } as const;
export type Tokens = typeof tokens;
