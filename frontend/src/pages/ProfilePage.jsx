import { useAuth } from "../AuthContext";
import { Navigate } from "react-router-dom";
import Avatar from "../components/Avatar";

export default function ProfilePage() {
  const { checking, user } = useAuth();

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
    </main>
  );
}