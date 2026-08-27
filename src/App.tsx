import UnifiedDisasterDashboard from "./features/disaster-dashboard/UnifiedDisasterDashboard";
import DeviceManagementPage from "./pages/device/DeviceManagementPage";
import "./styles.css";

function normalizedPath() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path || "/";
}

export default function App() {
  const path = normalizedPath();

  if (path === "/device") {
    return <DeviceManagementPage />;
  }

  return (
    <div className="app-shell">
      <UnifiedDisasterDashboard />
    </div>
  );
}