import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#0a0a0f',
        surface: '#111118',
        border:  '#1e1e2e',
        muted:   '#3a3a5c',
        accent:  '#7c3aed',
        green:   '#10b981',
        yellow:  '#f59e0b',
        red:     '#ef4444',
        'text-base': '#e2e2f0',
        'text-muted': '#8b8baa',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
