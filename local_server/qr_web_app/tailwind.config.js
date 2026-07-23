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
        "background": "#001712",
        "surface": "#001712",
        "surface-container": "#02251d",
        "surface-container-low": "#002019",
        "surface-container-high": "#0e2f28",
        "surface-container-highest": "#1a3a32",
        "primary": "#adcdc3",
        "primary-container": "#0f2d26",
        "secondary": "#e3c282",
        "secondary-container": "#5c4611",
        "on-background": "#c7eade",
        "on-surface": "#c7eade",
        "on-primary": "#18362e",
        "on-secondary": "#402d00",
        "outline": "#8b928f",
        "outline-variant": "#414846"
      },
      fontFamily: {
        serif: ["Playfair Display", "serif"],
        sans: ["Inter", "sans-serif"]
      }
    },
  },
  plugins: [],
}
