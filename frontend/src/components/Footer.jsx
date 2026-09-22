import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

const impactStats = [
  { value: 5000, label: "Happy Customers", icon: "✿" },
  { value: 10000, label: "Sarees Delivered", icon: "◈" },
  { value: 15, label: "Curated Categories", icon: "◇" },
  { value: 2500, label: "Wishlist Saves", icon: "♥" }
];

export default function Footer() {
  const impactRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.25 });
    if (impactRef.current) observer.observe(impactRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <footer className="site-footer">
      <section className="impact-section" ref={impactRef} aria-labelledby="impact-heading">
        <div className="container">
          <div className="impact-heading">
            <p className="eyebrow">Woven With Care</p>
            <h2 id="impact-heading">Our Impact</h2>
            <p>Tradition carried forward with every order.</p>
          </div>
          <div className="impact-stats">
            {impactStats.map((stat) => <ImpactStat key={stat.label} stat={stat} animate={isVisible} />)}
          </div>
        </div>
      </section>
      <div className="container footer-grid">
        <div>
          <img className="footer-logo" src="/brand/apple-touch-icon.png" alt="Vaishnavi Silk Emporium" />
          <h4>Vaishnavi Silk Emporium</h4>
          <p>
            Timeless sarees for every occasion, from handloom silks to graceful everyday weaves.
          </p>
        </div>
        <div>
          <h4>Quick Links</h4>
          <ul>
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <Link to="/collections">Saree Collections</Link>
            </li>
            <li>
              <Link to="/about">About Us</Link>
            </li>
            <li>
              <Link to="/contact">Contact Us</Link>
            </li>
          </ul>
        </div>
        <div>
          <h4>Contact</h4>
          <p>Email: vaishnavisilkemporiumdmm@gmail.com</p>
          <p>Phone: +91 99667 64430</p>
          <p>Dharmavaram, Andhra Pradesh - 515671</p>
        </div>
        <div>
          <h4>Social</h4>
          <div className="social-icons" aria-label="social links">
            <a className="social-icon-link" href="https://www.instagram.com/vaishnavi_silk_emporium" target="_blank" rel="noreferrer" aria-label="Follow Vaishnavi Silk Emporium on Instagram">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" className="social-icon-fill" /></svg>
            </a>
            <a className="social-icon-link" href="mailto:vaishnavisilkemporiumdmm@gmail.com" aria-label="Email Vaishnavi Silk Emporium">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>
            </a>
            <a className="social-icon-link" href="https://wa.me/919966764430" target="_blank" rel="noreferrer" aria-label="Chat with Vaishnavi Silk Emporium on WhatsApp">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z" /><path d="M8.5 8.5c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.6 1.4c.1.2 0 .4-.1.6l-.5.6c.7 1.1 1.4 1.7 2.5 2.2l.5-.6c.2-.2.4-.2.6-.1l1.4.7c.2.1.3.3.2.5-.2.8-.8 1.3-1.5 1.3-2.1-.1-5.8-3.4-5.9-5.6 0-.4.2-.7.5-1Z" /></svg>
            </a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} Vaishnavi Silk Emporium. All rights reserved.</p>
        <div className="footer-legal">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms & Conditions</Link>
        </div>
      </div>
    </footer>
  );
}

function ImpactStat({ stat, animate }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!animate) return undefined;
    const duration = 1200;
    const startedAt = performance.now();
    const frame = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setCount(Math.round(stat.value * eased));
      if (progress < 1) requestAnimationFrame(frame);
    };
    const frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [animate, stat.value]);

  return <div className="impact-stat">
    <span className="impact-icon" aria-hidden="true">{stat.icon}</span>
    <strong aria-label={`${stat.value.toLocaleString("en-IN")} ${stat.label}`}>{count.toLocaleString("en-IN")}+</strong>
    <span>{stat.label}</span>
  </div>;
}
