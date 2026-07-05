/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'mixer': {
          // Dynamic theme colors using CSS custom properties
          'bg': 'var(--color-bg, #1a1a1a)',
          'panel': 'var(--color-panel, #2a2a2a)',
          'fader': 'var(--color-fader, #3a3a3a)',
          'accent': 'var(--color-accent, #4a90e2)',
          // Static utility colors
          'danger': '#e74c3c',
          'warning': '#f39c12',
          'success': '#27ae60',
          'ai': '#9b59b6',
        }
      },
      textColor: {
        'mixer': 'var(--color-text, #ffffff)',
        'mixer-secondary': 'var(--color-text-secondary, #9ca3af)',
      }
    },
  },
  plugins: [],
}
