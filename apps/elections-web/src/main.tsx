import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";

const theme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#0a0a0a", paper: "#141414" },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* basename matches the Vite base — the SPA lives at /elections. */}
      <BrowserRouter basename="/elections">
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
