import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import AdminLayout from "./components/AdminLayout";
import PublicLayout from "./components/PublicLayout";
import HomePage from "./pages/HomePage";
import ProductsPage from "./pages/ProductsPage";
import CategoryPage from "./pages/CategoryPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import ProfilePage from "./pages/ProfilePage";
import AccountSettingsPage from "./pages/AccountSettingsPage";
import SecurityPage from "./pages/SecurityPage";
import CustomerFeaturePage from "./pages/CustomerFeaturePage";
import AboutPage from "./pages/AboutPage";
import ContactPage from "./pages/ContactPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminOverviewPage from "./pages/AdminOverviewPage";
import AdminInventoryPage from "./pages/AdminInventoryPage";
import AdminCategoriesPage from "./pages/AdminCategoriesPage";
import AdminReportsPage from "./pages/AdminReportsPage";
import AdminSettingsPage from "./pages/AdminSettingsPage";
import AdminSectionPage from "./pages/AdminSectionPage";
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import { useAuth } from "./AuthContext";
import BrandLoader from "./components/BrandLoader";

function ProtectedAdminRoute({ children }) {
  const { checking, user } = useAuth();
  if (checking) {
    return <BrandLoader label="Restoring your secure session..." />;
  }
  if (!user || user.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }
  return children;
}

function PublicOnlyRoute() {
  const { checking, user } = useAuth();
  if (checking) {
    return <BrandLoader />;
  }
  if (user?.role === "ADMIN") {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <Outlet />;
}

function PlaceholderPage({ title }) {
  return (
    <main className="container section prose">
      <h1>{title}</h1>
      <p>Content will be published soon.</p>
    </main>
  );
}

function DocumentTitle() {
  const location = useLocation();
  useEffect(() => {
    document.title = location.pathname.startsWith("/admin") ? "Vaishnavi Silk Emporium | Admin" : "Vaishnavi Silk Emporium";
  }, [location.pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <DocumentTitle />
      <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/collections" element={<ProductsPage />} />
          <Route path="/categories" element={<CategoryPage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings/account" element={<AccountSettingsPage />} />
          <Route path="/settings/security" element={<SecurityPage />} />
          <Route path="/wishlist" element={<CustomerFeaturePage type="wishlist" />} />
          <Route path="/recently-viewed" element={<CustomerFeaturePage type="recentlyViewed" />} />
          <Route path="/orders" element={<CustomerFeaturePage type="orders" />} />
          <Route path="/notifications" element={<CustomerFeaturePage type="notifications" />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy" element={<PlaceholderPage title="Privacy Policy" />} />
          <Route path="/terms" element={<PlaceholderPage title="Terms & Conditions" />} />
        </Route>
      </Route>
      <Route path="/login" element={<AdminLoginPage />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/admin/login" element={<Navigate to="/login" replace />} />
      <Route
        path="/admin"
        element={<ProtectedAdminRoute><AdminLayout /></ProtectedAdminRoute>}
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminOverviewPage />} />
        <Route path="products" element={<AdminDashboardPage />} />
        <Route path="inventory" element={<AdminInventoryPage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
