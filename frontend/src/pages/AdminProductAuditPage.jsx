import { useEffect, useState } from "react";
import { api } from "../api";

export default function AdminProductAuditPage() {
  const [audits, setAudits] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/products/admin/audit")
      .then((response) => setAudits(response.data.audits || []))
      .catch((requestError) => setError(requestError.response?.data?.message || "Unable to load product audit history."));
  }, []);

  return <main className="container section admin-layout">
    <div className="admin-head"><div><p className="eyebrow">Governance</p><h1>Product Audit History</h1></div></div>
    {error && <p className="error-text">{error}</p>}
    {!error && audits.length === 0 ? <div className="empty-state">No product audit events recorded yet.</div> : <section className="admin-table-wrap"><div className="table-scroll"><table className="admin-table"><thead><tr><th>Product</th><th>Action</th><th>User</th><th>Previous Values</th><th>New Values</th><th>Timestamp</th></tr></thead><tbody>{audits.map((audit) => <tr key={audit.AuditId}><td>{audit.ProductName || `Product #${audit.ProductId}`}</td><td>{audit.Action}</td><td>{audit.Username || "System"}</td><td>{audit.OldValues || "-"}</td><td>{audit.NewValues || "-"}</td><td>{new Date(audit.CreatedDate).toLocaleString()}</td></tr>)}</tbody></table></div></section>}
  </main>;
}
