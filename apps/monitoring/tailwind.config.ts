import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#08111f",
        foreground: "#ecf2ff",
        card: "#10213a",
        border: "rgba(148, 163, 184, 0.18)",
        accent: "#4fd1c5",
        warning: "#f59e0b",
        danger: "#f87171",
        success: "#34d399",
        muted: "#94a3b8",
      },
      boxShadow: {
        panel: "0 18px 50px rgba(2, 6, 23, 0.28)",
      },
      backgroundImage: {
        "ops-glow":
          "radial-gradient(circle at top left, rgba(79, 209, 197, 0.18), transparent 34%), radial-gradient(circle at top right, rgba(96, 165, 250, 0.18), transparent 38%)",
      },
    },
  },
  plugins: [],
};

export default config;
