/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: "var(--sidebar-bg)",
          border: "var(--sidebar-border)",
          hover: "var(--sidebar-hover)",
          active: "var(--sidebar-active)",
          text: "var(--sidebar-text)",
          "text-muted": "var(--sidebar-text-muted)",
        },
        surface: {
          DEFAULT: "var(--surface)",
          raised: "var(--surface-raised)",
          overlay: "var(--surface-overlay)",
        },
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          subtle: "var(--brand-subtle)",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
