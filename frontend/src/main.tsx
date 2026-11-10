import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import "./index.css";
import { AppProvider } from "./lib/app";
import Assistant from "./pages/Assistant";
import DataPage from "./pages/Data";
import Equity from "./pages/Equity";
import Graph from "./pages/Graph";
import Hours from "./pages/Hours";
import Overview from "./pages/Overview";
import Quality from "./pages/Quality";
import Report from "./pages/Report";
import Schools from "./pages/Schools";
import Textbooks from "./pages/Textbooks";
import Topics from "./pages/Topics";
import Validation from "./pages/Validation";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/topics" element={<Topics />} />
            <Route path="/graph" element={<Graph />} />
            <Route path="/textbooks" element={<Textbooks />} />
            <Route path="/hours" element={<Hours />} />
            <Route path="/quality" element={<Quality />} />
            <Route path="/schools" element={<Schools />} />
            <Route path="/equity" element={<Equity />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/report" element={<Report />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="/validation" element={<Validation />} />
            <Route path="*" element={<Overview />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AppProvider>
  </React.StrictMode>,
);
