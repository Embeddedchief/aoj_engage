import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#E4572E", 50: "#FDF1EC", 100: "#FBE0D5", 200: "#F6BFA9", 500: "#E4572E", 600: "#C9441E", 700: "#A23618" },
        navy: { DEFAULT: "#0E2240", 50: "#EEF2F8", 100: "#D7DFEC", 300: "#8D9DB8", 500: "#3A4E70", 700: "#16305A", 900: "#0E2240" },
        canvas: "#F7F6F3",
        ink: "#1B2433",
        muted: "#5F6B7D",
        line: "#E6E3DD",
        ok: "#2F7D5B",
        warn: "#B7791F",
        bad: "#B4362A",
      },
      fontFamily: { sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(14,34,64,.05), 0 1px 1px rgba(14,34,64,.03)" },
    },
  },
  plugins: [],
} satisfies Config;
