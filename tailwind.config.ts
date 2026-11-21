import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        ink2: 'rgb(var(--c-ink2) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        accentblue: 'rgb(var(--c-accentblue) / <alpha-value>)',
        softblue: 'rgb(var(--c-softblue) / <alpha-value>)',
        pastelyellow: 'rgb(var(--c-pastelyellow) / <alpha-value>)',
        pastelpink: 'rgb(var(--c-pastelpink) / <alpha-value>)',
        page: 'rgb(var(--c-page) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        surface2: 'rgb(var(--c-surface2) / <alpha-value>)',
        hairline: 'rgb(var(--c-hairline) / <alpha-value>)',
        success: 'rgb(var(--c-success) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)'
      },
      borderRadius: { card: '14px' },
      boxShadow: {
        card: '0 1px 2px rgb(var(--c-shadow) / 0.05), 0 4px 16px rgb(var(--c-shadow) / 0.06)',
        pop: '0 8px 32px rgb(var(--c-shadow) / 0.22)'
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
export default config;
