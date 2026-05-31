import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:             '#0D1117',
        surface:        '#161B22',
        border:         '#30363D',
        accent:         '#58A6FF',
        'accent-green': '#3FB950',
        'accent-purple':'#BC8CFF',
        'accent-amber': '#D29922',
        'accent-red':   '#F85149',
        'text-primary': '#E6EDF3',
        'text-muted':   '#8B949E',
        'text-faint':   '#484F58',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
