import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api, apiBaseUrl } from "../api";

export default function AdminLoginPage() {
  const [mode, setMode] = useState("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registration, setRegistration] = useState({ fullName: "", displayName: "", email: "", mobileNumber: "", password: "", confirmPassword: "" });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checking, login, register, user } = useAuth();

  if (!checking && user) {
    return <Navigate to={user.role === "ADMIN" ? "/admin/dashboard" : "/"} replace />;
  }

  async function startOAuth(provider) {
    setError("");
    try {
      const providers = await api.get("/auth/oauth/providers");
      if (!providers.data[provider]) {
        setError(`${provider === "google" ? "Google" : "GitHub"} Sign-In is not configured correctly.`);
        return;
      }
      const apiRoot = apiBaseUrl.replace(/\/api$/, "");
      window.location.assign(`${apiRoot}/api/auth/oauth/${provider}`);
    } catch {
      setError("Social Sign-In is unavailable. Check that the authentication service is running.");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const authenticatedUser = await login(identifier, password, rememberMe);
      navigate(authenticatedUser.role === "ADMIN" ? "/admin/dashboard" : "/", { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(registration);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err?.response?.data?.errors?.[0]?.message || err?.response?.data?.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-editorial" aria-hidden="true">
        <p>Vaishnavi Silk Emporium</p>
        <h1>Where tradition meets elegance.</h1>
        <span>Discover heirloom weaves and occasion-ready sarees, curated with care.</span>
      </section>
      <form className="auth-card" onSubmit={mode === "login" ? handleSubmit : handleRegister}>
        <div className="auth-brand"><img src="/brand/vaishnavi-silk-emporium-full.png" alt="Vaishnavi Silk Emporium" /><span>Where Tradition Meets Elegance</span></div>
        <h1>{mode === "login" ? "Welcome Back" : "Create Your Account"}</h1>
        <p className="auth-intro">{mode === "login" ? "Sign in to explore exclusive saree collections and pricing." : "Join us to save your favourite sarees and receive availability updates."}</p>
        {mode === "register" && <><label>Full Name<input value={registration.fullName} onChange={(e) => setRegistration({ ...registration, fullName: e.target.value })} required /></label><label>Display Name<input value={registration.displayName} onChange={(e) => setRegistration({ ...registration, displayName: e.target.value })} required /></label><label>Email Address<input type="email" value={registration.email} onChange={(e) => setRegistration({ ...registration, email: e.target.value })} required /></label><label>Mobile Number<input inputMode="numeric" value={registration.mobileNumber} onChange={(e) => setRegistration({ ...registration, mobileNumber: e.target.value })} required /></label></>}
        {mode === "login" && <><label htmlFor="identifier">Email or Mobile Number</label>
        <input
          id="identifier"
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        /></>}

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={mode === "login" ? password : registration.password}
          onChange={(e) => mode === "login" ? setPassword(e.target.value) : setRegistration({ ...registration, password: e.target.value })}
          required
          minLength={8}
        />
        {mode === "register" && <label>Confirm Password<input type="password" value={registration.confirmPassword} onChange={(e) => setRegistration({ ...registration, confirmPassword: e.target.value })} minLength={8} required /></label>}

        {mode === "login" && <label className="checkbox-line">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          Remember me on this device
        </label>}

        {(error || searchParams.get("oauthError")) && <p className="error-text">{error || "Social sign-in is unavailable or could not be completed."}</p>}

        <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
          {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create User Account"}
        </button>
        {mode === "login" && <><div className="auth-divider"><span>OR</span></div><button className="oauth-button google" type="button" onClick={() => startOAuth("google")}>Continue with Google</button><button className="oauth-button github" type="button" onClick={() => startOAuth("github")}>Continue with GitHub</button><p className="auth-switch">Don't have an account? <button type="button" onClick={() => setMode("register")}>Create Account</button></p></>}
        {mode === "register" && <p className="auth-switch">Already have an account? <button type="button" onClick={() => setMode("login")}>Sign In</button></p>}
      </form>
    </main>
  );
}
