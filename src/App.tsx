import React, { useState } from "react";
import { AuthProvider, useAuth, NetworkIcon } from "iris-ui";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { NetworkTestPage } from "./pages/NetworkTestPage";

const AUTH_BASE_URL = import.meta.env.DEV ? "/api/auth" : "https://netvrk.nu";

type AuthPage = "login" | "register";

/** Inner component so it can call useAuth() inside the provider. */
const AppRoutes: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const [authPage, setAuthPage] = useState<AuthPage>("login");

  if (!isAuthenticated) {
    return authPage === "login" ? (
      <LoginPage onRegisterClick={() => setAuthPage("register")} />
    ) : (
      <RegisterPage onLoginClick={() => setAuthPage("login")} />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Minimal top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.6rem 2rem",
          borderBottom: "1px solid #e0e3e8",
          background: "#fff",
          fontSize: 13,
          color: "#555",
          flexShrink: 0,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NetworkIcon size={22} animated />
          <strong style={{ color: "#1a1a1a" }}>ReactionChain</strong>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {user?.email && <span>{user.email}</span>}
          <button
            onClick={logout}
            style={{
              background: "none",
              border: "1px solid #d0d5dd",
              borderRadius: 6,
              padding: "4px 12px",
              cursor: "pointer",
              fontSize: 12,
              color: "#555",
            }}
          >
            Sign out
          </button>
        </span>
      </div>
      <NetworkTestPage />
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
