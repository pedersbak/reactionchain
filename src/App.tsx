import React, { useState, useRef, useEffect } from "react";
import { AuthProvider, useAuth, NetworkIcon } from "iris-ui";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { NetworkTestPage } from "./pages/NetworkTestPage";
import { MobileNetworkPage } from "./pages/MobileNetworkPage";
import { useIsMobile } from "./hooks/useIsMobile";
import { useTheme, THEME_META, type Theme } from "./hooks/useTheme";

const AUTH_BASE_URL = "/api/auth";

type AuthPage = "login" | "register";

/** Inner component so it can call useAuth() inside the provider. */
const AppRoutes: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [authPage, setAuthPage] = useState<AuthPage>("login");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMobile = useIsMobile();
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!isAuthenticated) {
    return authPage === "login" ? (
      <LoginPage onRegisterClick={() => setAuthPage("register")} />
    ) : (
      <RegisterPage onLoginClick={() => setAuthPage("login")} />
    );
  }

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : "??";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* ── TOPBAR ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          height: 56,
          background: "var(--bg-topbar)",
          borderBottom: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
          flexShrink: 0,
          zIndex: 100,
        }}
      >
        {/* Left: logo + nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
              fontSize: 15,
              color: "var(--logo-color)",
              letterSpacing: "-0.01em",
            }}
          >
            <NetworkIcon size={20} animated />
            netvrk.nu
          </div>
          {!isMobile && (
            <nav style={{ display: "flex", gap: 4 }}>
              <a
                href="#"
                style={{
                  padding: "5px 13px",
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 6,
                  color: "var(--accent)",
                  background: "var(--accent-light)",
                  textDecoration: "none",
                }}
              >
                Network
              </a>
            </nav>
          )}
        </div>

        {/* Right: user avatar + settings dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div ref={settingsRef} style={{ position: "relative" }}>
            <div
              onClick={() => setSettingsOpen((o) => !o)}
              title="Settings & theme"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--accent)",
                color: "var(--accent-btn-text)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                userSelect: "none",
                flexShrink: 0,
              }}
            >
              {initials}
            </div>

            {settingsOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  width: 224,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  boxShadow: "0 8px 28px rgba(0,0,0,0.2)",
                  zIndex: 200,
                  overflow: "hidden",
                }}
              >
                {/* User info */}
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {user?.email}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    Signed in
                  </div>
                </div>

                {/* Theme selection */}
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      marginBottom: 10,
                    }}
                  >
                    Color Theme
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {(Object.entries(THEME_META) as [Theme, (typeof THEME_META)[Theme]][]).map(
                      ([id, meta]) => (
                        <button
                          key={id}
                          onClick={() => {
                            setTheme(id);
                            setSettingsOpen(false);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            width: "100%",
                            padding: "7px 10px",
                            borderRadius: 7,
                            border:
                              theme === id
                                ? "1.5px solid var(--accent)"
                                : "1.5px solid transparent",
                            background: theme === id ? "var(--accent-light)" : "transparent",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: theme === id ? 600 : 400,
                            color: theme === id ? "var(--accent)" : "var(--text-primary)",
                            textAlign: "left",
                            fontFamily: "inherit",
                          }}
                        >
                          <div
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: meta.swatch,
                              flexShrink: 0,
                              border: "1.5px solid rgba(0,0,0,0.1)",
                            }}
                          />
                          {meta.emoji} {meta.label}
                          {theme === id && (
                            <span style={{ marginLeft: "auto", fontSize: 12 }}>✓</span>
                          )}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Sign out */}
                <div style={{ padding: "10px 16px" }}>
                  <button
                    onClick={logout}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 7,
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
          background: "var(--bg-page)",
        }}
      >
        {isMobile ? <MobileNetworkPage /> : <NetworkTestPage />}
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <AuthProvider baseUrl={AUTH_BASE_URL}>
    <AppRoutes />
  </AuthProvider>
);

export default App;
