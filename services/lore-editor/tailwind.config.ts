import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas:  '#0d0d0d',
        surface: '#161616',
        raised:  '#222222',
        border:  '#2a2a2a',
        gold:    '#c9a96e',
        'gold-hover': '#e0bf85',
        dim:     '#555555',
        muted:   '#888888',
        text:    '#e0e0e0',
      },
      fontFamily: {
        sans: ["'Segoe UI'", 'system-ui', 'sans-serif'],
        mono: ["'Fira Code'", "'Cascadia Code'", 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
