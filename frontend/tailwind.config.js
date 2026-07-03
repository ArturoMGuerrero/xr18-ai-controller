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
          'bg': '#1a1a1a',
          'panel': '#2a2a2a',
          'fader': '#3a3a3a',
          'accent': '#4a90e2',
          'danger': '#e74c3c',
          'warning': '#f39c12',
          'success': '#27ae60',
          'ai': '#9b59b6',
        }
      }
    },
  },
  plugins: [],
}
