import React from "react";
import { LoginForm, NetworkIcon } from "iris-ui";
import { useAuth } from "iris-ui";
import type { LoginCredentials } from "iris-ui";

interface LoginPageProps {
  onRegisterClick: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onRegisterClick }) => {
  const { login } = useAuth();

  const handleSubmit = async (credentials: LoginCredentials) => {
    await login(credentials);
    // On success the AuthProvider updates isAuthenticated → App re-renders to the main view.
  };

  return (
    <div style={styles.page}>
      <div style={styles.logo}>
        <NetworkIcon size={36} animated />
        <span style={styles.logoText}>ReactionChain</span>
      </div>
      <LoginForm onSubmit={handleSubmit} onRegisterClick={onRegisterClick} />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#f5f6f8",
    gap: "1.5rem",
    padding: "2rem",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  logoText: {
    fontSize: "1.25rem",
    fontWeight: 700,
    color: "#1a1a1a",
    letterSpacing: "-0.02em",
  },
};
