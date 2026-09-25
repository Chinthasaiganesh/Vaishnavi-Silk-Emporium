import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ICONS = {
  cart: <><circle cx="9.5" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2.5 3.5h2.3l2.4 11.1a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.5L21.2 7.5H6" /></>,
  timer: <><path d="M9.6 2.5h4.8" /><path d="M12 8.6V13l3 2" /><circle cx="12" cy="13.2" r="8.3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6.6V12l3.6 2.2" /></>,
  payment: <><rect x="2.5" y="5" width="19" height="14" rx="2.6" /><path d="M2.5 9.8h19" /><path d="M6.5 15h4" /></>,
  alert: <><path d="M12 3.4 1.8 20.6h20.4Z" /><path d="M12 9.6v4.3" /><path d="M12 17.1h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11.2v5" /><path d="M12 7.8h.01" /></>,
  shipping: <><path d="M2.6 6.4h9.8v9.8H2.6z" /><path d="M12.4 10h4.1l3 3v3.2h-7.1z" /><circle cx="6.6" cy="18" r="1.8" /><circle cx="17.2" cy="18" r="1.8" /></>,
  package: <><path d="M21 8.4 12 3.2 3 8.4v7.2l9 5.2 9-5.2z" /><path d="M3 8.4 12 13.6l9-5.2" /><path d="M12 13.6V21" /></>,
  declined: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>
};

export function NotificationGlyph({ icon, variant, reducedMotion }) {
  const animated = !reducedMotion;
  if (variant === "success" && (!icon || icon === "check")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <motion.circle cx="12" cy="12" r="9" initial={animated ? { pathLength: 0 } : false} animate={animated ? { pathLength: 1 } : undefined} transition={{ duration: 0.45, ease: "easeOut" }} />
        <motion.path d="m7.8 12.4 2.9 2.9 5.5-6" initial={animated ? { pathLength: 0 } : false} animate={animated ? { pathLength: 1 } : undefined} transition={{ duration: 0.35, ease: "easeOut", delay: 0.3 }} />
      </svg>
    );
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{ICONS[icon] || ICONS.info}</svg>;
}

function formatClock(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function CountdownMeter({ expiresAt, totalSeconds, label }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const total = totalSeconds || 300;
  return (
    <div className="notification-countdown">
      <div className="notification-countdown-head"><span>{label || "Time remaining"}</span><strong>{formatClock(remaining)}</strong></div>
      <div className="notification-countdown-track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={remaining} aria-label={label || "Time remaining"}>
        <div className="notification-countdown-fill" style={{ width: `${Math.min(100, Math.max(0, (remaining / total) * 100))}%` }} />
      </div>
    </div>
  );
}

export default function NotificationModal({ notification, onClose }) {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const titleId = useId();
  const messageId = useId();
  const isConfirm = typeof notification?.resolve === "function";
  const dismissible = notification?.dismissible !== false;

  const close = useCallback((result) => {
    if (!notification) return;
    notification.resolve?.(Boolean(result));
    onClose(notification.id);
  }, [notification, onClose]);

  useEffect(() => {
    if (!notification) return undefined;
    restoreFocusRef.current = document.activeElement;
    const frame = window.requestAnimationFrame(() => {
      const target = dialogRef.current?.querySelector("[data-autofocus]") || dialogRef.current?.querySelector(FOCUSABLE_SELECTOR) || dialogRef.current;
      target?.focus();
    });
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      if (restoreFocusRef.current instanceof HTMLElement && document.contains(restoreFocusRef.current)) restoreFocusRef.current.focus();
    };
  }, [notification?.id]);

  function handleKeyDown(event) {
    if (event.key === "Escape" && (dismissible || isConfirm)) {
      event.stopPropagation();
      close(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [])].filter((node) => node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function runAction(action, fallbackResult) {
    if (!action) { close(fallbackResult); return; }
    action.onClick?.();
    close(fallbackResult);
    if (action.to) navigate(action.to, action.navigateOptions);
  }

  const variant = notification?.variant || "info";
  const primary = notification?.primaryAction || (isConfirm ? { label: notification?.confirmLabel || "Confirm" } : { label: "Got it" });
  const secondary = notification?.secondaryAction || (isConfirm ? { label: notification?.cancelLabel || "Cancel" } : null);

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          className="notification-modal-backdrop"
          initial={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget && dismissible) close(false); }}
        >
          <motion.section
            ref={dialogRef}
            className={`notification-modal notification-modal-${variant}`}
            role={variant === "error" || variant === "warning" ? "alertdialog" : "dialog"}
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            initial={reducedMotion ? false : { opacity: 0, y: 28, scale: 0.96 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 30, mass: 0.7 }}
          >
            <span className="notification-modal-grip" aria-hidden="true" />
            {dismissible && <button type="button" className="notification-modal-close" onClick={() => close(false)} aria-label="Close notification">×</button>}
            <motion.div
              className="notification-modal-glyph"
              initial={reducedMotion ? false : { scale: 0.6, opacity: 0 }}
              animate={reducedMotion ? undefined : { scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.05 }}
            >
              <NotificationGlyph icon={notification.icon} variant={variant} reducedMotion={reducedMotion} />
            </motion.div>
            <div className="notification-modal-copy">
              {notification.eyebrow && <p className="notification-modal-eyebrow">{notification.eyebrow}</p>}
              <h2 id={titleId}>{notification.title}</h2>
              <p id={messageId}>{notification.message}</p>
              {notification.detail && <p className="notification-modal-detail">{notification.detail}</p>}
            </div>
            {notification.countdown?.expiresAt && <CountdownMeter {...notification.countdown} />}
            <div className="notification-modal-actions">
              <button type="button" className="btn btn-primary" data-autofocus onClick={() => runAction(primary, true)}>{primary.label}</button>
              {secondary && <button type="button" className="btn btn-outline" onClick={() => runAction(secondary, false)}>{secondary.label}</button>}
            </div>
            {notification.footnote && <small className="notification-modal-footnote">{notification.footnote}</small>}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
