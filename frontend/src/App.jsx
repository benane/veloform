import { useState, useEffect } from "react";
import { useApi } from "./hooks/useApi";
import CTLChart from "./components/CTLChart";
import HRVOverlay from "./components/HRVOverlay";
import WeeklyOverview from "./components/WeeklyOverview";
import TrafficLight from "./components/TrafficLight";
import FuelingCalc from "./components/FuelingCalc";
import SleepChart from "./components/SleepChart";
import NextWorkoutCard from "./components/NextWorkoutCard";
import LastWorkoutCard from "./components/LastWorkoutCard";
import AthletePage from "./components/AthletePage";
import MaintenancePage from "./components/MaintenancePage";

const PAGES = [
  { id: "overview", label: "Übersicht", icon: "◈" },
  { id: "fitness", label: "Fitness / Form", icon: "▲" },
  { id: "hrv", label: "HRV & Last", icon: "♡" },
  { id: "sleep", label: "Schlaf", icon: "◐" },
  { id: "weekly", label: "Wochenübersicht", icon: "▦" },
  { id: "fueling", label: "Fueling", icon: "◎" },
  { id: "athlete", label: "Athlet", icon: "◉" },
  { id: "maintenance", label: "Wartung", icon: "⚙" },
];

function Sidebar({ page, setPage }) {
  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        Velo<span>Form</span>
      </div>
      <nav className="sidebar-nav">
        {PAGES.map((p) => (
          <button
            key={p.id}
            className={`nav-item ${page === p.id ? "active" : ""}`}
            onClick={() => setPage(p.id)}
          >
            <span>{p.icon}</span>
            {p.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Overview() {
  return (
    <>
      <h1 className="page-title">Übersicht</h1>
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <TrafficLight />
        <NextWorkoutCard />
      </div>
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <LastWorkoutCard />
        <CTLChart days={60} />
      </div>
      <WeeklyOverview weeks={4} />
    </>
  );
}

function MaintenanceAlerts({ onNavigate }) {
  const { data: alerts } = useApi("/api/maintenance/alerts");
  const { data: athlete } = useApi("/api/athlete");
  const [dismissed, setDismissed] = useState([]);

  if (!alerts?.length) return null;
  const visible = alerts.filter((a) => !dismissed.includes(`${a.bike_id}-${a.type}-${a.action_type}`));
  if (!visible.length) return null;

  const bikeNames = Object.fromEntries((athlete?.bikes ?? []).map((b) => [b.id, b.name]));

  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 300, display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
      {visible.map((a) => {
        const key = `${a.bike_id}-${a.type}-${a.action_type}`;
        const isReplacement = a.action_type === "replaced";
        const color = isReplacement ? "var(--red)" : "var(--yellow)";
        const bikeName = bikeNames[a.bike_id];
        return (
          <div key={key} style={{
            background: "var(--surface-2)",
            border: `1px solid ${color}`,
            borderLeft: `4px solid ${color}`,
            borderRadius: 10, padding: "12px 14px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color }}>
                {isReplacement ? "⚠ Wechsel fällig" : "○ Wartung fällig"}
              </div>
              <button onClick={() => setDismissed((d) => [...d, key])} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-muted)", fontSize: 14, padding: "0 0 0 8px", lineHeight: 1,
              }}>✕</button>
            </div>
            {bikeName && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{bikeName}</div>
            )}
            <div style={{ fontSize: 13, marginTop: 2 }}>{a.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {a.km_since.toLocaleString("de-AT")} km seit letzter Aktion · Intervall: {a.interval_km.toLocaleString("de-AT")} km
            </div>
            <button onClick={() => onNavigate("maintenance", a.bike_id)} style={{
              marginTop: 8, padding: "4px 12px", borderRadius: 6, fontSize: 11,
              background: "none", border: `1px solid ${color}`,
              color, cursor: "pointer",
            }}>Zur Wartung →</button>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("overview");
  const [maintenanceBikeId, setMaintenanceBikeId] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  function navigateTo(targetPage, bikeId = null) {
    setPage(targetPage);
    if (targetPage === "maintenance" && bikeId) setMaintenanceBikeId(bikeId);
  }

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const currentPage = PAGES.find((p) => p.id === page);

  const renderPage = () => {
    switch (page) {
      case "overview": return <Overview />;
      case "fitness":
        return (
          <>
            <h1 className="page-title">Fitness & Form</h1>
            <CTLChart days={90} />
          </>
        );
      case "hrv":
        return (
          <>
            <h1 className="page-title">HRV & Trainingslast</h1>
            <HRVOverlay days={60} />
          </>
        );
      case "sleep":
        return (
          <>
            <h1 className="page-title">Schlaf</h1>
            <SleepChart days={42} />
          </>
        );
      case "weekly":
        return (
          <>
            <h1 className="page-title">Wochenübersicht</h1>
            <WeeklyOverview weeks={12} />
          </>
        );
      case "fueling":
        return (
          <>
            <h1 className="page-title">Ride Fueling</h1>
            <FuelingCalc />
          </>
        );
      case "athlete":
        return (
          <>
            <h1 className="page-title">Athlet</h1>
            <AthletePage />
          </>
        );
      case "maintenance":
        return (
          <>
            <h1 className="page-title">Wartung</h1>
            <MaintenancePage initialBikeId={maintenanceBikeId} />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="app">
        <Sidebar page={page} setPage={setPage} />
        <main className="main">
          {isMobile && (
            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>Velo<span style={{ color: "var(--accent)" }}>Form</span></span>
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>· {currentPage?.label}</span>
            </div>
          )}
          {renderPage()}
        </main>
      </div>
      <MaintenanceAlerts onNavigate={navigateTo} />
    </>
  );
}
