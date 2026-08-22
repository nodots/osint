import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { EventsPage } from "./pages/EventsPage.js";
import { MapPage } from "./pages/MapPage.js";
import { MethodologyPage } from "./pages/MethodologyPage.js";
import { OverviewPage } from "./pages/OverviewPage.js";
import { RaceDetailPage } from "./pages/RaceDetailPage.js";
import { RacesPage } from "./pages/RacesPage.js";

const NAV = [
  { label: "Overview", path: "/overview" },
  { label: "Map", path: "/map" },
  { label: "Races", path: "/races" },
  { label: "Events", path: "/events" },
  { label: "Methodology", path: "/methodology" },
];

export function App() {
  const location = useLocation();
  const current =
    NAV.find((item) => location.pathname.startsWith(item.path))?.path ??
    "/overview";

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar variant="dense">
          <Typography variant="h6" sx={{ mr: 4, fontWeight: 300 }}>
            Election Integrity Monitor
          </Typography>
          <Tabs value={current} textColor="inherit">
            {NAV.map((item) => (
              <Tab
                key={item.path}
                label={item.label}
                value={item.path}
                component={Link}
                to={item.path}
              />
            ))}
          </Tabs>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ flex: 1, p: 3 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/races" element={<RacesPage />} />
          <Route path="/races/:districtId" element={<RaceDetailPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </Box>
    </Box>
  );
}
