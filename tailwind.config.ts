import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // AOJ red, taken from the logo
        brand: { DEFAULT: "#E5120E", 50: "#FFF2F1", 100: "#FFE0DD", 200: "#FFBEB8", 300: "#FF9087", 500: "#E5120E", 600: "#C40D0A", 700: "#9C0C09" },
        // "night": the deep neutral used for hero cards, active pills and headings
        navy: { DEFAULT: "#15171E", 50: "#F4F4F6", 100: "#E6E6EB", 300: "#9C9EAB", 500: "#50525F", 700: "#262833", 900: "#15171E" },
        canvas: "#EFEFEC",
        ink: "#15171E",
        muted: "#6B6D78",
        line: "#E8E7E3",
        ok: "#1F8A5B",
        warn: "#B7791F",
        bad: "#C2261D",
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      borderRadius: { "4xl": "2rem" },
      boxShadow: {
        card: "0 1px 2px rgba(21,23,30,.04), 0 8px 24px -12px rgba(21,23,30,.08)",
        lift: "0 2px 4px rgba(21,23,30,.05), 0 18px 40px -16px rgba(21,23,30,.22)",
        glow: "0 10px 30px -10px rgba(229,18,14,.55)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        float: { "0%,100%": { transform: "translateY(0) rotate(var(--r,0deg))" }, "50%": { transform: "translateY(-14px) rotate(var(--r,0deg))" } },
        drift: { "0%,100%": { transform: "translate(0,0)" }, "50%": { transform: "translate(18px,-12px)" } },
        pop: { "0%": { opacity: "0", transform: "scale(.6)" }, "70%": { transform: "scale(1.06)" }, "100%": { opacity: "1", transform: "scale(1)" } },
        wiggle: { "0%,100%": { transform: "rotate(-4deg)" }, "50%": { transform: "rotate(4deg)" } },
        ping2: { "0%": { transform: "scale(1)", opacity: ".7" }, "100%": { transform: "scale(2.4)", opacity: "0" } },
        grow: { from: { transform: "scaleY(0)" }, to: { transform: "scaleY(1)" } },
        draw: { from: { strokeDashoffset: "1" }, to: { strokeDashoffset: "0" } },
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        fly: {
          "0%": { transform: "translate(0,0) rotate(-8deg)", opacity: "0" },
          "15%": { opacity: "1" },
          "80%": { opacity: "1" },
          "100%": { transform: "translate(120px,-90px) rotate(6deg)", opacity: "0" },
        },
      },
      animation: {
        rise: "rise .55s cubic-bezier(.2,.7,.2,1) both",
        float: "float 6s ease-in-out infinite",
        drift: "drift 14s ease-in-out infinite",
        pop: "pop .6s cubic-bezier(.2,.7,.2,1) both",
        wiggle: "wiggle 3s ease-in-out infinite",
        ping2: "ping2 1.8s cubic-bezier(0,0,.2,1) infinite",
        grow: "grow .8s cubic-bezier(.2,.7,.2,1) both",
        draw: "draw 1.6s ease-out both",
        marquee: "marquee 28s linear infinite",
        fly: "fly 4.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
