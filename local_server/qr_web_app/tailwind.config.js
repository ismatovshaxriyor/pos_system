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
        "background": "#0A1F44",
        "surface": "#0A1F44",
        "surface-container": "#0F2A5C",
        "surface-container-low": "#0F2A5C",
        "surface-container-high": "#14356F",
        "surface-container-highest": "#14356F",
        "primary": "#5C9FD6",
        "primary-container": "#0F2A5C",
        "secondary": "#0077CC",
        "secondary-container": "#002F52",
        "on-background": "#FFFFFF",
        "on-surface": "#FFFFFF",
        "on-primary": "#0A1F44",
        "on-secondary": "#001B33",
        "outline": "#8697AC",
        "outline-variant": "#5C6B85"
      },
      fontFamily: {
        serif: ["Playfair Display", "serif"],
        sans: ["Inter", "sans-serif"]
      }
    },
  },
  plugins: [],
}
