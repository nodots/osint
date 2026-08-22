import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Served under /elections on the platform gateway (osint.nodots.com/elections).
  base: "/elections/",
  plugins: [react()],
  server: {
    port: 6751,
  },
});
