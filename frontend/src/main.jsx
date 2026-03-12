import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import AgentPage from "./pages/AgentPage.jsx";
import AboutPage from "./pages/AboutPage.jsx";
import TracesPage from "./pages/TracesPage.jsx";
import ApiDocsPage from "./pages/ApiDocsPage.jsx";
import "./index.css";
import "./App.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<AgentPage />} />
          <Route path="/traces" element={<TracesPage />} />
          <Route path="/api" element={<ApiDocsPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
