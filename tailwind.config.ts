import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import { themes, radius, fontFamily, fontSize, type ThemeColors } from './src/core/theme/tokens';

/** "#0B1F3A" → "11 31 58" so Tailwind opacity modifiers work with CSS variables. */
function hexToRgbChannels(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function cssVars(theme: ThemeColors): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme)) out[`--c-${kebab(k)}`] = hexToRgbChannels(v);
  return out;
}

const colorKeys = Object.keys(themes.light) as (keyof ThemeColors)[];
const colors: Record<string, string> = {};
for (const k of colorKeys) colors[kebab(k)] = `rgb(var(--c-${kebab(k)}) / <alpha-value>)`;

const sizes: Record<string, [string, { lineHeight: string }]> = {};
for (const [k, v] of Object.entries(fontSize)) sizes[k] = [`${v[0] / 16}rem`, { lineHeight: `${v[1] / 16}rem` }];

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      fontFamily: { sans: [...fontFamily.sans] },
      fontSize: sizes,
      borderRadius: {
        sm: `${radius.sm}px`,
        md: `${radius.md}px`,
        lg: `${radius.lg}px`,
        xl: `${radius.xl}px`,
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        pop: { '0%': { transform: 'scale(0.6)', opacity: '0' }, '70%': { transform: 'scale(1.08)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        draw: { to: { strokeDashoffset: '0' } },
        flash: { '0%': { backgroundColor: 'rgb(var(--c-accent) / 0.35)' }, '100%': { backgroundColor: 'transparent' } },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-in': 'slide-in 220ms ease-out',
        'slide-up': 'slide-up 220ms ease-out',
        pop: 'pop 420ms ease-out both',
        draw: 'draw 500ms 250ms ease-out forwards',
        flash: 'flash 1.4s ease-out',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ':root': cssVars(themes.light), '.dark': cssVars(themes.dark) });
    }),
  ],
} satisfies Config;
