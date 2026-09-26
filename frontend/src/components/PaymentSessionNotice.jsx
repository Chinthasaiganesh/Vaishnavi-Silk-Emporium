import { useEffect, useState } from "react";

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function PaymentSessionNotice({ session, onContinue, onCancel, canceling = false }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!session?.ExpiresAt) return null;
  const serverOffset = session.serverTime ? new Date(session.serverTime).getTime() - now : 0;
  const remaining = Math.max(0, Math.ceil((new Date(session.ExpiresAt).getTime() - (now + serverOffset)) / 1000));

  return (
    <section className="payment-session-notice" role="status" aria-live="polite">
      <div className="payment-session-copy">
        <strong>Payment In Progress</strong>
        <p>You already have an active payment transaction.</p>
        <p>Please complete the current payment or wait for it to expire before making changes to your cart.</p>
        <span>Time Remaining: <b>{formatTime(remaining)}</b></span>
      </div>
      <div className="payment-session-actions">
        <button className="btn btn-primary" type="button" onClick={onContinue}>Continue Payment</button>
        <button className="btn btn-outline" type="button" disabled={canceling} onClick={onCancel}>
          {canceling ? "Canceling..." : "Cancel Payment Session"}
        </button>
      </div>
    </section>
  );
}