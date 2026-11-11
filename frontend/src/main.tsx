import { ShieldAlert } from "lucide-react";
import React, { lazy, Suspense, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout, { allowed } from "./components/Layout";
import { Loading } from "./components/ui";
import "./index.css";
import { AppProvider, useApp } from "./lib/app";
import Login from "./pages/Login";

const Assistant = lazy(() => import("./pages/Assistant"));
const DataPage = lazy(() => import("./pages/Data"));
const Equity = lazy(() => import("./pages/Equity"));
const Graph = lazy(() => import("./pages/Graph"));
const Hours = lazy(() => import("./pages/Hours"));
const MySchool = lazy(() => import("./pages/MySchool"));
const Compare = lazy(() => import("./pages/Compare"));
const Overview = lazy(() => import("./pages/Overview"));
const Pilot = lazy(() => import("./pages/Pilot"));
const Quality = lazy(() => import("./pages/Quality"));
const Report = lazy(() => import("./pages/Report"));
const Schools = lazy(() => import("./pages/Schools"));
const Textbooks = lazy(() => import("./pages/Textbooks"));
const Topics = lazy(() => import("./pages/Topics"));
const Validation = lazy(() => import("./pages/Validation"));

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
        <Suspense fallback={<Loading />}>
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
          <Route path="/compare" element={<Compare />} />
          <Route path="/school-report" element={<Report />} />
          <Route path="/equity" element={<Equity />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/report" element={<Report />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/validation" element={<Validation />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
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
