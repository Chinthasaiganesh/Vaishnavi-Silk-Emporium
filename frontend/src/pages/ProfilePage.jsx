import { useAuth } from "../AuthContext";
import { Link, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Avatar from "../components/Avatar";
import { api } from "../api";

export default function ProfilePage() {
  const { checking, user } = useAuth();
  const [updates, setUpdates] = useState([]);

  useEffect(() => {
    if (user?.role !== "USER") return;
    api.get("/notifications").then((response) => setUpdates((response.data.notifications || []).slice(0, 4))).catch(() => setUpdates([]));
  }, [user]);

  if (checking) {
    return <main className="container section">Restoring your session...</main>;
  }

  if (user?.role !== "USER") {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="container section profile-page">
      <div className="profile-page-heading">
        <Avatar user={user} size="large" />
        <div>
          <p className="eyebrow">Your Account</p>
          <h1>{user.displayName || user.username}</h1>
          <p>{user.email || "Add an email address in settings."}</p>
        </div>
      </div>

      <section className="profile-card profile-readonly"><h2>Account Information</h2><dl><dt>Display Name</dt><dd>{user.displayName || user.fullName || user.username}</dd><dt>Full Name</dt><dd>{user.fullName || "Not provided"}</dd><dt>Username</dt><dd>{user.username}</dd><dt>Email Address</dt><dd>{user.email || "Not provided"}</dd><dt>Mobile Number</dt><dd>{user.mobileNumber || "Not provided"}</dd><dt>Member Since</dt><dd>{user.createdDate ? new Date(user.createdDate).toLocaleDateString() : "Not available"}</dd><dt>Last Login</dt><dd>{user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Not available"}</dd><dt>User Role</dt><dd>User</dd></dl></section>
      <section className="profile-card account-updates">
        <div className="checkout-section-heading"><h2>Latest Updates</h2><Link to="/notifications">View All</Link></div>
        {updates.length === 0 ? <p className="muted">No account updates yet.</p> : updates.map((update) => <Link key={update.notificationId} to={update.orderId ? `/orders/${update.orderId}` : "/notifications"} className={update.isRead ? "account-update" : "account-update unread"}><strong>{update.title}</strong><span>{update.message}</span><small>{new Date(update.createdDate).toLocaleString()}</small></Link>)}
      </section>
    </main>
  );
}