import { db } from "./db.js";
import { nowIso } from "./utils.js";

export async function recordProductAudit({ productId, userId = null, action, oldValues = null, newValues = null }) {
  await db.prepare("INSERT INTO ProductAuditLog (ProductId, UserId, Action, OldValues, NewValues, CreatedDate) VALUES (?, ?, ?, ?, ?, ?)").run(
    productId,
    userId,
    action,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
    nowIso()
  );
}

export async function getProductAudit(productId = null) {
  const query = `
    SELECT a.AuditId, a.ProductId, p.ProductName, a.UserId, u.Username, a.Action,
      a.OldValues, a.NewValues, a.CreatedDate
    FROM ProductAuditLog a
    LEFT JOIN Products p ON p.ProductId = a.ProductId
    LEFT JOIN Users u ON u.UserId = a.UserId
    ${productId === null ? "" : "WHERE a.ProductId = ?"}
    ORDER BY datetime(a.CreatedDate) DESC, a.AuditId DESC
  `;
  return productId === null ? await db.prepare(query).all() : await db.prepare(query).all(productId);
}
