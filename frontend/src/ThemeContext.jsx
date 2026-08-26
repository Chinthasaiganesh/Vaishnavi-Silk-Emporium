import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

const ThemeContext = createContext(null);
const themeKey = "blueorbit_theme";

function savedTheme() {
  return localStorage.getItem(themeKey) === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState(savedTheme);

  function setTheme(nextTheme) {
    const resolvedTheme = nextTheme === "dark" ? "dark" : "light";
    setThemeState(resolvedTheme);
    localStorage.setItem(themeKey, resolvedTheme);
  }

  function toggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    if (user?.preferences && typeof user.preferences.darkMode === "boolean") {
      setTheme(user.preferences.darkMode ? "dark" : "light");
    }
  }, [user?.userId]);

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme must be used within ThemeProvider.");
  return theme;
}