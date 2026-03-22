import React, { useState } from "react";
import { AuthProvider, useAuth, NetworkIcon } from "iris-ui";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { NetworkTestPage } from "./pages/NetworkTestPage";
import { MobileNetworkPage } from "./pages/MobileNetworkPage";
import { useIsMobile } from "./hooks/useIsMobile";

const AUTH_BASE_URL = "/api/auth";

type AuthPage = "login" | "register";

/** Inner component so it can call useAuth() inside the provider. */
const AppRoutes: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const [authPage, setAuthPage] = useState<AuthPage>("login");
  const isMobile = useIsMobile();

  if (!isAuthenticated) {
    return authPage === "login" ? (
      <LoginPage onRegisterClick={() => setAuthPage("register")} />
    ) : (
      <RegisterPage onLoginClick={() => setAuthPage("login")} />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#0d1117" }}>
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile ? "0.5rem 0.75rem" : "0.6rem 2rem",
          borderBottom: "1px solid #1e2638",
          background: "#0d1117",
          fontSize: 13,
          color: "#8892a4",
          flexShrink: 0,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NetworkIcon size={22} animated />
          <strong style={{ color: "#e2e8f0", letterSpacing: "-0.01em" }}>netvrk.nu</strong>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {!isMobile && user?.email && <span style={{ color: "#8892a4" }}>{user.email}</span>}
          <button
            onClick={logout}
            style={{
              background: "none",
              border: "1px solid #2a3347",
              borderRadius: 6,
              padding: "4px 12px",
              cursor: "pointer",
              fontSize: 12,
              color: "#8892a4",
            }}
          >
            Sign out
          </button>
        </span>
      </div>
      {isMobile ? <MobileNetworkPage /> : <NetworkTestPage />}
    </div>
  );
};

/// <reference types="vite/client" />
const App: React.FC = () => (
  <AuthProvider baseUrl={AUTH_BASE_URL}>
    <AppRoutes />
  </AuthProvider>
);

export default App;
