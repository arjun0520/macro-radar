import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#07130c",
        surface: "#f6f5ee",
        panel: "#ffffff",
        mint: "#00c076",
        forest: "#063b27",
        limewash: "#e8f6df",
        warning: "#ffb020",
        danger: "#ff4d4f"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(7, 19, 12, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
