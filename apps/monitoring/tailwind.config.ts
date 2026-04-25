import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#050505",
        foreground: "#fafafa",
        card: "#09090b",
        border: "#27272a",
        accent: "#14b8a6",
        warning: "#eab308",
        danger: "#ef4444",
        success: "#22c55e",
        muted: "#a1a1aa",
      },
      boxShadow: {
        panel: "0 18px 50px rgba(0, 0, 0, 0.4)",
        "glow-accent": "0 0 10px rgba(20, 184, 166, 0.5)",
        "glow-success": "0 0 10px rgba(34, 197, 94, 0.5)",
        "glow-warning": "0 0 10px rgba(234, 179, 8, 0.5)",
        "glow-danger": "0 0 10px rgba(239, 68, 68, 0.5)",
      },
      backgroundImage: {
        "ops-glow": "radial-gradient(circle at top center, rgba(20,184,166,0.1) 0%, transparent 70%)",
        "card-gradient": "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)",
      },
      animation: {
        "status-pulse": "status-pulse 1.8s ease-in-out infinite",
      },
      keyframes: {
        "status-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
