import { useEffect, useState } from "react";

export default function Avatar({ user, size = "medium" }) {
  const label = user?.displayName || user?.fullName || user?.username || "User";
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [user?.avatarUrl]);

  if (user?.avatarUrl && !imageFailed) {
    return (
      <img
        className={`avatar avatar-${size}`}
        src={resolveAvatarUrl(user.avatarUrl)}
        alt={`${label} profile`}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return <span className={`avatar avatar-${size}`} aria-label={`${label} profile`}>{initials}</span>;
}

function resolveAvatarUrl(url) {
  if (url.startsWith("http")) {
    return url;
  }
  const apiRoot = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace("/api", "");
  return `${apiRoot}${url}`;
}