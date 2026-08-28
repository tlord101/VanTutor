/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        darkBg: '#0B0D10',
        darkSurface: '#111418',
        darkBorder: '#242932',
        darkTextPrimary: '#F5F7FA',
        darkTextSecondary: '#9AA3AF',
      }
    },
  },
  plugins: [],
}
