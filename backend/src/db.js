import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required. Configure the Supabase PostgreSQL pooler connection string in Render.");
}

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.nodeEnv === "production" ? { rejectUnauthorized: false } : false
});

const primaryKeys = new Map([
  ["Users", "UserId"],
  ["RefreshSessions", "SessionId"],
  ["NotificationSubscriptions", "SubscriptionId"],
  ["Notifications", "NotificationId"],
  ["Wishlists", "WishlistId"],
  ["TranslationCache", "CacheKey"],
  ["Categories", "CategoryId"],
  ["StoreSettings", "SettingsId"],
  ["Products", "ProductId"],
  ["Inventory", "InventoryId"],
  ["InventoryAuditLog", "AuditId"],
  ["ProductAuditLog", "AuditId"],
  ["Carts", "CartId"],
  ["CartItems", "CartItemId"],
  ["CartAuditLog", "AuditId"],
  ["Addresses", "AddressId"],
  ["Orders", "OrderId"],
  ["OrderItems", "OrderItemId"],
  ["OrderAuditLog", "AuditId"],
  ["OrderStatusHistory", "StatusHistoryId"]
]);

const identifiers = [...primaryKeys.keys(), ...primaryKeys.values(),
  "Username", "PasswordHash", "Role", "FullName", "DisplayName", "Email", "AvatarUrl", "MobileNumber", "Preferences", "CreatedDate", "LastLogin", "OAuthProvider", "OAuthSubject", "IsEnabled",
  "ExpiresAt", "ProductId", "NotificationType", "IsActive", "IsSent", "SentDate", "OrderId", "Type", "Title", "Message", "IsRead", "ReadDate",
  "ProductName", "Description", "Category", "Price", "ImageUrl", "Quantity", "IsFeatured", "Fabric", "WeavingStyle", "Colour", "Occasion", "SareeLength", "BlousePieceIncluded", "CareInstructions", "Rating", "UpdatedDate",
  "CacheKey", "SourceLanguage", "TargetLanguage", "SourceText", "TranslatedText", "Provider", "CategoryId", "CategoryName", "SettingsId", "StoreName", "Tagline", "Phone", "Address", "BusinessDescription", "UpdatedBy",
  "InventoryId", "CurrentStock", "AvailableStock", "ReservedStock", "Status", "AdminUserId", "Action", "OldStock", "NewStock", "AuditId", "UserId", "OldValues", "NewValues",
  "CartId", "CartItemId", "UnitPrice", "OldQuantity", "NewQuantity", "AddressId", "AddressLine1", "AddressLine2", "City", "State", "PostalCode", "Country", "IsDefault",
  "OrderNumber", "IdempotencyKey", "PaymentMethod", "OrderStatus", "SubTotal", "ShippingAmount", "DiscountAmount", "GrandTotal", "CancelledAt", "CancellationReason", "RefundStatus", "RefundReference",
  "OrderItemId", "ProductPrice", "LineTotal", "StatusHistoryId", "OldStatus", "NewStatus", "ChangedBy", "ChangedAt",
  "nextId", "ItemCount", "ProductCount", "WishlistCreatedDate", "CustomerName", "CustomerMobile"
].sort((first, second) => second.length - first.length);

const identifierPattern = new RegExp(`(?<!")\\b(${identifiers.join("|")})\\b(?!")`, "g");

function quoteIdentifiers(sql) {
  const parts = sql.split(/('(?:''|[^'])*'|"(?:""|[^"])*")/g);
  return parts.map((part, index) => index % 2 ? part : part.replace(identifierPattern, '"$1"')).join("");
}

function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export function normalizeSql(sql) {
  return convertPlaceholders(
    quoteIdentifiers(sql)
      .replace(/datetime\(([^)]+)\)/gi, "$1")
      .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO")
  );
}

function appendReturning(sql) {
  if (/\bRETURNING\b/i.test(sql) || !/^\s*INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+"?([A-Za-z][A-Za-z0-9_]*)"?/i.test(sql)) return sql;
  const table = sql.match(/^\s*INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+"?([A-Za-z][A-Za-z0-9_]*)"?/i)?.[1];
  const key = primaryKeys.get(table);
  if (!key) return sql;
  const conflictSuffix = /^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql) ? " ON CONFLICT DO NOTHING" : "";
  return `${sql}${conflictSuffix} RETURNING "${key}"`;
}

async function execute(sql, params = []) {
  const normalized = normalizeSql(sql);
  return pool.query(normalized, params);
}

export async function query(sql, params = []) {
  return execute(sql, params);
}

export async function get(sql, params = []) {
  const result = await execute(sql, params);
  return result.rows[0];
}

export async function all(sql, params = []) {
  const result = await execute(sql, params);
  return result.rows;
}

export async function run(sql, params = []) {
  const result = await execute(appendReturning(sql), params);
  const insertedId = Object.values(result.rows[0] || {})[0];
  return { changes: result.rowCount, lastInsertRowid: insertedId };
}

export async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tx = {
      query: (sql, params = []) => client.query(normalizeSql(sql), params),
      get: async (sql, params = []) => (await client.query(normalizeSql(sql), params)).rows[0],
      all: async (sql, params = []) => (await client.query(normalizeSql(sql), params)).rows,
      run: async (sql, params = []) => {
        const result = await client.query(normalizeSql(appendReturning(sql)), params);
        return { changes: result.rowCount, lastInsertRowid: Object.values(result.rows[0] || {})[0] };
      }
    };
    const value = await work(tx);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export const db = {
  prepare(sql) {
    return {
      get: (...params) => get(sql, params),
      all: (...params) => all(sql, params),
      run: (...params) => run(sql, params)
    };
  },
  exec: (sql) => query(sql),
  close: () => pool.end()
};

export async function getDatabaseVersion() {
  return (await get("SELECT version() AS version")).version;
}

export async function assertDatabaseConnection() {
  const version = await getDatabaseVersion();
  console.info(JSON.stringify({ level: "info", message: "PostgreSQL database connected", version }));
  return version;
}

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Users" (
      "UserId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      "Username" TEXT UNIQUE NOT NULL,
      "PasswordHash" TEXT NOT NULL,
      "Role" TEXT NOT NULL CHECK("Role" IN ('ADMIN', 'USER')),
      "FullName" TEXT NOT NULL DEFAULT '',
      "DisplayName" TEXT NOT NULL DEFAULT '',
      "Email" TEXT UNIQUE,
      "AvatarUrl" TEXT,
      "MobileNumber" TEXT NOT NULL DEFAULT '',
      "Preferences" TEXT NOT NULL DEFAULT '{}',
      "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "LastLogin" TIMESTAMPTZ,
      "OAuthProvider" TEXT,
      "OAuthSubject" TEXT,
      "IsEnabled" INTEGER NOT NULL DEFAULT 1 CHECK("IsEnabled" IN (0, 1)),
      UNIQUE("OAuthProvider", "OAuthSubject")
    );

    CREATE TABLE IF NOT EXISTS "Categories" (
      "CategoryId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      "CategoryName" TEXT UNIQUE NOT NULL,
      "Description" TEXT NOT NULL DEFAULT '',
      "IsActive" INTEGER NOT NULL DEFAULT 1 CHECK("IsActive" IN (0, 1)),
      "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "UpdatedDate" TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "Products" (
      "ProductId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      "ProductName" TEXT NOT NULL,
      "Description" TEXT NOT NULL,
      "Category" TEXT NOT NULL,
      "Price" NUMERIC(12,2) NOT NULL CHECK("Price" >= 0),
      "ImageUrl" TEXT,
      "Quantity" INTEGER NOT NULL DEFAULT 0 CHECK("Quantity" >= 0),
      "IsActive" INTEGER NOT NULL DEFAULT 0 CHECK("IsActive" IN (0, 1)),
      "IsFeatured" INTEGER NOT NULL DEFAULT 0 CHECK("IsFeatured" IN (0, 1)),
      "Fabric" TEXT NOT NULL DEFAULT '',
      "WeavingStyle" TEXT NOT NULL DEFAULT '',
      "Colour" TEXT NOT NULL DEFAULT '',
      "Occasion" TEXT NOT NULL DEFAULT '',
      "SareeLength" TEXT NOT NULL DEFAULT '5.5 metres',
      "BlousePieceIncluded" INTEGER NOT NULL DEFAULT 1 CHECK("BlousePieceIncluded" IN (0, 1)),
      "CareInstructions" TEXT NOT NULL DEFAULT '',
      "Rating" NUMERIC(2,1) NOT NULL DEFAULT 4.5 CHECK("Rating" >= 0 AND "Rating" <= 5),
      "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "UpdatedDate" TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "RefreshSessions" ("SessionId" UUID PRIMARY KEY, "UserId" BIGINT REFERENCES "Users"("UserId") ON DELETE CASCADE, "ExpiresAt" TIMESTAMPTZ NOT NULL, "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS "Wishlists" ("WishlistId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "UserId" BIGINT REFERENCES "Users"("UserId") ON DELETE CASCADE, "ProductId" BIGINT REFERENCES "Products"("ProductId") ON DELETE CASCADE, "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE("UserId", "ProductId"));
    CREATE TABLE IF NOT EXISTS "NotificationSubscriptions" ("SubscriptionId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "UserId" BIGINT REFERENCES "Users"("UserId") ON DELETE CASCADE, "ProductId" BIGINT REFERENCES "Products"("ProductId") ON DELETE CASCADE, "NotificationType" TEXT NOT NULL DEFAULT 'BACK_IN_STOCK', "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now(), "IsActive" INTEGER NOT NULL DEFAULT 1 CHECK("IsActive" IN (0, 1)), "IsSent" INTEGER NOT NULL DEFAULT 0 CHECK("IsSent" IN (0, 1)), "SentDate" TIMESTAMPTZ, UNIQUE("UserId", "ProductId", "NotificationType"));
    CREATE TABLE IF NOT EXISTS "Notifications" ("NotificationId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "UserId" BIGINT REFERENCES "Users"("UserId") ON DELETE CASCADE, "ProductId" BIGINT REFERENCES "Products"("ProductId") ON DELETE SET NULL, "OrderId" BIGINT, "Type" TEXT NOT NULL, "Title" TEXT NOT NULL, "Message" TEXT NOT NULL, "IsRead" INTEGER NOT NULL DEFAULT 0 CHECK("IsRead" IN (0, 1)), "ReadDate" TIMESTAMPTZ, "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS "TranslationCache" ("CacheKey" TEXT PRIMARY KEY, "SourceLanguage" TEXT NOT NULL, "TargetLanguage" TEXT NOT NULL, "SourceText" TEXT NOT NULL, "TranslatedText" TEXT NOT NULL, "Provider" TEXT NOT NULL, "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS "StoreSettings" ("SettingsId" INTEGER PRIMARY KEY CHECK("SettingsId" = 1), "StoreName" TEXT NOT NULL, "Tagline" TEXT NOT NULL DEFAULT '', "Email" TEXT NOT NULL, "Phone" TEXT NOT NULL DEFAULT '', "Address" TEXT NOT NULL DEFAULT '', "BusinessDescription" TEXT NOT NULL DEFAULT '', "UpdatedDate" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedBy" BIGINT REFERENCES "Users"("UserId"));

    CREATE TABLE IF NOT EXISTS "Inventory" ("InventoryId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "ProductId" BIGINT NOT NULL UNIQUE REFERENCES "Products"("ProductId") ON DELETE CASCADE, "CurrentStock" INTEGER NOT NULL DEFAULT 0 CHECK("CurrentStock" >= 0), "AvailableStock" INTEGER NOT NULL DEFAULT 0 CHECK("AvailableStock" >= 0), "ReservedStock" INTEGER NOT NULL DEFAULT 0 CHECK("ReservedStock" >= 0), "Status" TEXT NOT NULL CHECK("Status" IN ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK')), "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedDate" TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK("AvailableStock" + "ReservedStock" = "CurrentStock"));
    CREATE TABLE IF NOT EXISTS "InventoryAuditLog" ("AuditId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "InventoryId" BIGINT NOT NULL REFERENCES "Inventory"("InventoryId") ON DELETE CASCADE, "ProductId" BIGINT NOT NULL REFERENCES "Products"("ProductId") ON DELETE CASCADE, "AdminUserId" BIGINT REFERENCES "Users"("UserId") ON DELETE SET NULL, "Action" TEXT NOT NULL CHECK("Action" IN ('VIEWED', 'UPDATED', 'RESTOCKED', 'STATUS_CHANGED')), "OldStock" INTEGER, "NewStock" INTEGER, "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS "ProductAuditLog" ("AuditId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "ProductId" BIGINT NOT NULL, "UserId" BIGINT REFERENCES "Users"("UserId") ON DELETE SET NULL, "Action" TEXT NOT NULL CHECK("Action" IN ('CREATED', 'UPDATED', 'DELETED', 'ARCHIVED', 'RESTORED', 'VISIBILITY_CHANGED', 'INVENTORY_CHANGED')), "OldValues" TEXT, "NewValues" TEXT, "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now());

    CREATE TABLE IF NOT EXISTS "Carts" ("CartId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "UserId" BIGINT NOT NULL UNIQUE REFERENCES "Users"("UserId") ON DELETE CASCADE, "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedDate" TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS "CartItems" ("CartItemId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "CartId" BIGINT NOT NULL REFERENCES "Carts"("CartId") ON DELETE CASCADE, "ProductId" BIGINT NOT NULL REFERENCES "Products"("ProductId") ON DELETE CASCADE, "Quantity" INTEGER NOT NULL CHECK("Quantity" > 0), "UnitPrice" NUMERIC(12,2) NOT NULL CHECK("UnitPrice" >= 0), "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedDate" TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE("CartId", "ProductId"));
    CREATE TABLE IF NOT EXISTS "CartAuditLog" ("AuditId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "CartId" BIGINT NOT NULL REFERENCES "Carts"("CartId") ON DELETE CASCADE, "CartItemId" BIGINT REFERENCES "CartItems"("CartItemId") ON DELETE SET NULL, "UserId" BIGINT NOT NULL REFERENCES "Users"("UserId") ON DELETE CASCADE, "ProductId" BIGINT REFERENCES "Products"("ProductId") ON DELETE SET NULL, "Action" TEXT NOT NULL CHECK("Action" IN ('ADDED', 'REMOVED', 'QUANTITY_UPDATED', 'CLEARED')), "OldQuantity" INTEGER, "NewQuantity" INTEGER, "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now());

    CREATE TABLE IF NOT EXISTS "Addresses" ("AddressId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "UserId" BIGINT NOT NULL REFERENCES "Users"("UserId") ON DELETE CASCADE, "FullName" TEXT NOT NULL, "MobileNumber" TEXT NOT NULL, "AddressLine1" TEXT NOT NULL, "AddressLine2" TEXT NOT NULL DEFAULT '', "City" TEXT NOT NULL, "State" TEXT NOT NULL, "PostalCode" TEXT NOT NULL, "Country" TEXT NOT NULL DEFAULT 'India', "IsDefault" INTEGER NOT NULL DEFAULT 0 CHECK("IsDefault" IN (0, 1)), "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedDate" TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS "Orders" ("OrderId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "UserId" BIGINT NOT NULL REFERENCES "Users"("UserId"), "AddressId" BIGINT NOT NULL REFERENCES "Addresses"("AddressId"), "OrderNumber" TEXT NOT NULL UNIQUE, "IdempotencyKey" TEXT, "PaymentMethod" TEXT NOT NULL DEFAULT 'COD', "OrderStatus" TEXT NOT NULL DEFAULT 'PENDING' CHECK("OrderStatus" IN ('PENDING', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED')), "SubTotal" NUMERIC(12,2) NOT NULL CHECK("SubTotal" >= 0), "ShippingAmount" NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK("ShippingAmount" >= 0), "DiscountAmount" NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK("DiscountAmount" >= 0), "GrandTotal" NUMERIC(12,2) NOT NULL CHECK("GrandTotal" >= 0), "CancelledAt" TIMESTAMPTZ, "CancellationReason" TEXT, "RefundStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK("RefundStatus" IN ('NOT_APPLICABLE', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')), "RefundReference" TEXT, "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now(), "UpdatedDate" TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE("UserId", "IdempotencyKey"));
    CREATE TABLE IF NOT EXISTS "OrderItems" ("OrderItemId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "OrderId" BIGINT NOT NULL REFERENCES "Orders"("OrderId") ON DELETE CASCADE, "ProductId" BIGINT REFERENCES "Products"("ProductId") ON DELETE SET NULL, "ProductName" TEXT NOT NULL, "ProductPrice" NUMERIC(12,2) NOT NULL CHECK("ProductPrice" >= 0), "Quantity" INTEGER NOT NULL CHECK("Quantity" > 0), "LineTotal" NUMERIC(12,2) NOT NULL CHECK("LineTotal" >= 0), "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS "OrderAuditLog" ("AuditId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "OrderId" BIGINT REFERENCES "Orders"("OrderId") ON DELETE CASCADE, "UserId" BIGINT REFERENCES "Users"("UserId") ON DELETE SET NULL, "Action" TEXT NOT NULL CHECK("Action" IN ('ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_CANCELLED', 'INVENTORY_DEDUCTED', 'ADDRESS_ADDED')), "CreatedDate" TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS "OrderStatusHistory" ("StatusHistoryId" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "OrderId" BIGINT NOT NULL REFERENCES "Orders"("OrderId") ON DELETE CASCADE, "OldStatus" TEXT, "NewStatus" TEXT NOT NULL, "ChangedBy" BIGINT REFERENCES "Users"("UserId") ON DELETE SET NULL, "ChangedAt" TIMESTAMPTZ NOT NULL DEFAULT now());

    CREATE INDEX IF NOT EXISTS "idx_products_active" ON "Products"("IsActive");
    CREATE INDEX IF NOT EXISTS "idx_products_category" ON "Products"("Category");
    CREATE INDEX IF NOT EXISTS "idx_products_name" ON "Products"("ProductName");
    CREATE INDEX IF NOT EXISTS "idx_refresh_sessions_user" ON "RefreshSessions"("UserId");
    CREATE INDEX IF NOT EXISTS "idx_notification_subscriptions_product" ON "NotificationSubscriptions"("ProductId", "IsSent");
    CREATE INDEX IF NOT EXISTS "idx_notifications_user" ON "Notifications"("UserId", "IsRead", "CreatedDate");
    CREATE INDEX IF NOT EXISTS "idx_wishlists_user" ON "Wishlists"("UserId", "CreatedDate");
    CREATE INDEX IF NOT EXISTS "idx_categories_active" ON "Categories"("IsActive");
    CREATE INDEX IF NOT EXISTS "idx_products_featured" ON "Products"("IsFeatured");
    CREATE INDEX IF NOT EXISTS "idx_inventory_status" ON "Inventory"("Status");
    CREATE INDEX IF NOT EXISTS "idx_inventory_audit_product" ON "InventoryAuditLog"("ProductId", "CreatedDate");
    CREATE INDEX IF NOT EXISTS "idx_product_audit_product" ON "ProductAuditLog"("ProductId", "CreatedDate");
    CREATE INDEX IF NOT EXISTS "idx_cart_items_cart" ON "CartItems"("CartId");
    CREATE INDEX IF NOT EXISTS "idx_cart_audit_user" ON "CartAuditLog"("UserId", "CreatedDate");
    CREATE INDEX IF NOT EXISTS "idx_orders_user" ON "Orders"("UserId", "CreatedDate");
    CREATE INDEX IF NOT EXISTS "idx_order_items_order" ON "OrderItems"("OrderId");
    CREATE INDEX IF NOT EXISTS "idx_order_status_history_order" ON "OrderStatusHistory"("OrderId", "ChangedAt");
  `);

  await pool.query(`
    INSERT INTO "Inventory" ("ProductId", "CurrentStock", "AvailableStock", "ReservedStock", "Status", "CreatedDate", "UpdatedDate")
    SELECT "ProductId", "Quantity", "Quantity", 0,
      CASE WHEN "Quantity" = 0 THEN 'OUT_OF_STOCK' WHEN "Quantity" <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END,
      "CreatedDate", "UpdatedDate"
    FROM "Products"
    ON CONFLICT("ProductId") DO NOTHING
  `);
}

await assertDatabaseConnection();
await initializeDatabase();
