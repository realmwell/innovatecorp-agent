import { NavLink, Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="layout">
      <nav className="nav">
        <div className="nav-inner">
          <NavLink to="/" className="nav-brand">
            <span className="brand-icon">IC</span>
            InnovateCorp
          </NavLink>
          <div className="nav-links">
            <NavLink to="/" end className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              Agent
            </NavLink>
            <NavLink to="/traces" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              Traces
            </NavLink>
            <NavLink to="/api" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              API
            </NavLink>
            <NavLink to="/about" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              About
            </NavLink>
            <a href="https://github.com/realmwell/innovatecorp-agent" target="_blank" rel="noopener noreferrer" className="nav-link external">
              GitHub
            </a>
          </div>
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <p>Built with LangGraph + LangChain + LangSmith + AWS Bedrock</p>
          <p className="footer-sub">PS Solutions Architect Take-Home Exercise</p>
        </div>
      </footer>
    </div>
  );
}
