import { ShieldAlert } from "lucide-react";
import React, { type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout, { allowed } from "./components/Layout";
import { Loading } from "./components/ui";
import "./index.css";
import { AppProvider, useApp } from "./lib/app";
import Assistant from "./pages/Assistant";
import DataPage from "./pages/Data";
import Equity from "./pages/Equity";
import Graph from "./pages/Graph";
import Hours from "./pages/Hours";
import Login from "./pages/Login";
import MySchool from "./pages/MySchool";
import Overview from "./pages/Overview";
import Pilot from "./pages/Pilot";
import Quality from "./pages/Quality";
import Report from "./pages/Report";
import Schools from "./pages/Schools";
import Textbooks from "./pages/Textbooks";
import Topics from "./pages/Topics";
import Validation from "./pages/Validation";

function Guard({ children }: { children: ReactNode }) {
  const { user, t } = useApp();
  const loc = useLocation();
  if (user?.role === "director" && loc.pathname === "/") return <Navigate to="/school" replace />;
  if (!allowed(loc.pathname, user?.role)) {
    return (
      <div className="card mx-auto mt-16 max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-warn" />
        <div className="mt-3 text-[15px] font-medium">{t("no_access")}</div>
      </div>
    );
  }
  return <>{children}</>;
}

function Shell() {
  const { user, authReady } = useApp();
  if (!authReady) return <Loading />;
  if (!user) return <Login />;
  return (
    <Layout>
      <Guard>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/school" element={<MySchool />} />
          <Route path="/topics" element={<Topics />} />
          <Route path="/graph" element={<Graph />} />
          <Route path="/textbooks" element={<Textbooks />} />
          <Route path="/hours" element={<Hours />} />
          <Route path="/pilot" element={<Pilot />} />
          <Route path="/quality" element={<Quality />} />
          <Route path="/schools" element={<Schools />} />
          <Route path="/equity" element={<Equity />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/report" element={<Report />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/validation" element={<Validation />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Guard>
    </Layout>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AppProvider>
  </React.StrictMode>,
);
