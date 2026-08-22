import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Served under /ukraine on the platform gateway (osint.nodots.com/ukraine).
  base: "/ukraine/",
  plugins: [react()],
  server: {
    port: 6731,
  },
});
