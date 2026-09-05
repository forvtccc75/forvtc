import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          500: "#1d5fd6",
          600: "#174db2",
          700: "#123d8e",
          900: "#0b234f",
        },
      },
    },
  },
  plugins: [],
};
export default config;
