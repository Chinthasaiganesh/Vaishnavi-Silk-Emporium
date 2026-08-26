import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

const translations = {
  en: { home: "Home", products: "Products", search: "Search products", signIn: "Sign In", notifications: "Notifications", wishlist: "Wishlist", profile: "My Profile", settings: "Account Settings", password: "Change Password", logout: "Logout", language: "Language", english: "English", telugu: "తెలుగు", explore: "Explore Products", featured: "Featured Products", viewDetails: "View Details", inStock: "In Stock", outOfStock: "Out of Stock", welcome: "Welcome Back", save: "Save Changes", cancel: "Cancel Changes", notify: "Notify Me When Available", saveWishlist: "Save to Wishlist", removeWishlist: "Remove from Wishlist", account: "Account Settings", personalPicks: "Personal picks for you" },
  te: { home: "హోమ్", products: "ఉత్పత్తులు", search: "ఉత్పత్తులను వెతకండి", signIn: "సైన్ ఇన్", notifications: "నోటిఫికేషన్లు", wishlist: "కోరికల జాబితా", profile: "నా ప్రొఫైల్", settings: "ఖాతా సెట్టింగ్స్", password: "పాస్‌వర్డ్ మార్చండి", logout: "లాగ్ అవుట్", language: "భాష", english: "English", telugu: "తెలుగు", explore: "ఉత్పత్తులను చూడండి", featured: "ప్రత్యేక ఉత్పత్తులు", viewDetails: "వివరాలు చూడండి", inStock: "అందుబాటులో ఉంది", outOfStock: "స్టాక్ లేదు", welcome: "తిరిగి స్వాగతం", save: "మార్పులను సేవ్ చేయండి", cancel: "మార్పులను రద్దు చేయండి", notify: "అందుబాటులో వచ్చినప్పుడు తెలియజేయండి", saveWishlist: "కోరికల జాబితాలో సేవ్ చేయండి", removeWishlist: "కోరికల జాబితా నుండి తొలగించండి", account: "ఖాతా సెట్టింగ్స్", personalPicks: "మీ కోసం ప్రత్యేక ఎంపికలు" }
};

const LanguageContext = createContext(null);
const languageKey = "blueorbit_language";

export function LanguageProvider({ children }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState(() => localStorage.getItem(languageKey) === "te" ? "te" : "en");

  function setLanguage(nextLanguage) {
    const resolved = nextLanguage === "te" ? "te" : "en";
    setLanguageState(resolved);
    localStorage.setItem(languageKey, resolved);
  }

  useEffect(() => {
    if (user?.preferences?.language) setLanguage(user.preferences.language === "Telugu" ? "te" : "en");
  }, [user?.userId]);

  useEffect(() => {
    document.documentElement.lang = language === "te" ? "te" : "en";
  }, [language]);

  function t(key) {
    return translations[language][key] || translations.en[key] || key;
  }

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const language = useContext(LanguageContext);
  if (!language) throw new Error("useLanguage must be used within LanguageProvider.");
  return language;
}