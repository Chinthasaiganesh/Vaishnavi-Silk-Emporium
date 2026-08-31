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
            <p>Every order carries a little more tradition forward.</p>
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
          <p>Email: care@vaishnavisilks.example</p>
          <p>Phone: +91 99667 64430</p>
          <p>Dharmavaram, Andhra Pradesh - 515671</p>
        </div>
        <div>
          <h4>Social</h4>
          <div className="social-icons" aria-label="social icons">
            <span>in</span>
            <span>x</span>
            <span>ig</span>
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
