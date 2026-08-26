import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <img className="footer-logo" src="/brand/apple-touch-icon.png" alt="Vaishnavi Silk Emporium" />
          <h4>Vaishnavi Silk Emporium</h4>
          <p>
            Timeless sarees for every occasion, from heirloom silks to graceful everyday weaves.
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
          <p>Phone: +91 90000 00000</p>
          <p>Hyderabad, Telangana</p>
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
