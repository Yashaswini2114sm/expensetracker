/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f1115',
        surface: '#1c1f26',
        primary: '#3b82f6',
        primaryHover: '#2563eb',
        text: '#f8fafc',
        textMuted: '#94a3b8',
        border: '#334155',
        danger: '#ef4444',
      }
    },
  },
  plugins: [],
}
