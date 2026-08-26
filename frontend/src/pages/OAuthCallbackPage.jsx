import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function OAuthCallbackPage() {
  const { restore, user } = useAuth();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    restore().then((restoredUser) => {
      if (!restoredUser) setFailed(true);
    });
  }, []);

  if (failed) return <Navigate to="/login?oauthError=authentication_failed" replace />;
  if (user) return <Navigate to={user.role === "ADMIN" ? "/admin/dashboard" : "/"} replace />;
  return <main className="container section auth-wrap">Completing secure sign-in...</main>;
}