import React from "react";
import { RegisterForm, NetworkIcon } from "iris-ui";
import { useAuth } from "iris-ui";
import type { RegisterCredentials } from "iris-ui";

interface RegisterPageProps {
  onLoginClick: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onLoginClick }) => {
  const { register } = useAuth();

  const handleSubmit = async (credentials: RegisterCredentials) => {
    await register(credentials);
    // RegisterForm shows a success screen with a "Go to sign in" button.
  };

  return (
    <div style={styles.page}>
      <div style={styles.logo}>
        <NetworkIcon size={36} animated />
        <span style={styles.logoText}>netvrk.nu</span>
      </div>
      <RegisterForm onSubmit={handleSubmit} onLoginClick={onLoginClick} />
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
    background: "#0d1117",
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
    color: "#e2e8f0",
    letterSpacing: "-0.02em",
  },
};
