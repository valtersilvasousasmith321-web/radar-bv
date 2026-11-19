import type { Config } from "tailwindcss";

/**
 * Paleta oficial do Radar BV (definida no briefing do projeto):
 * navy institucional, vermelho de urgência, verde esmeralda local/WhatsApp.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0F172A",
        urgente: "#DC2626",
        esmeralda: "#059669",
        leitura: "#F8FAFC",
      },
      fontFamily: {
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
