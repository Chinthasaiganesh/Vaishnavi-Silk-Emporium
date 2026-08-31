import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const databasePath = config.sqliteDatabasePath || path.join(__dirname, "..", "data", "catalog.db");
const dataDir = path.dirname(databasePath);
const uploadsDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export const db = new DatabaseSync(databasePath);

console.info(JSON.stringify({ level: "info", message: "SQLite database opened", databasePath }));

db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS Users (
    UserId INTEGER PRIMARY KEY AUTOINCREMENT,
    Username TEXT UNIQUE NOT NULL,
    PasswordHash TEXT NOT NULL,
    Role TEXT NOT NULL CHECK(Role IN ('ADMIN', 'USER')),
    FullName TEXT NOT NULL DEFAULT '',
    DisplayName TEXT NOT NULL DEFAULT '',
    Email TEXT UNIQUE,
    AvatarUrl TEXT,
    MobileNumber TEXT NOT NULL DEFAULT '',
    Preferences TEXT NOT NULL DEFAULT '{}',
    CreatedDate TEXT NOT NULL DEFAULT '',
    LastLogin TEXT,
    OAuthProvider TEXT,
    OAuthSubject TEXT,
    IsEnabled INTEGER NOT NULL DEFAULT 1 CHECK(IsEnabled IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS RefreshSessions (
    SessionId TEXT PRIMARY KEY,
    UserId INTEGER NOT NULL,
    ExpiresAt TEXT NOT NULL,
    CreatedDate TEXT NOT NULL,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS NotificationSubscriptions (
    SubscriptionId INTEGER PRIMARY KEY AUTOINCREMENT,
    UserId INTEGER NOT NULL,
    ProductId INTEGER NOT NULL,
    NotificationType TEXT NOT NULL DEFAULT 'BACK_IN_STOCK',
    CreatedDate TEXT NOT NULL,
    IsActive INTEGER NOT NULL DEFAULT 1 CHECK(IsActive IN (0, 1)),
    IsSent INTEGER NOT NULL DEFAULT 0 CHECK(IsSent IN (0, 1)),
    SentDate TEXT,
    UNIQUE(UserId, ProductId, NotificationType),
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE,
    FOREIGN KEY (ProductId) REFERENCES Products(ProductId) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS Notifications (
    NotificationId INTEGER PRIMARY KEY AUTOINCREMENT,
    UserId INTEGER NOT NULL,
    ProductId INTEGER,
    OrderId INTEGER,
    Type TEXT NOT NULL,
    Title TEXT NOT NULL,
    Message TEXT NOT NULL,
    IsRead INTEGER NOT NULL DEFAULT 0 CHECK(IsRead IN (0, 1)),
    ReadDate TEXT,
    CreatedDate TEXT NOT NULL,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE,
    FOREIGN KEY (ProductId) REFERENCES Products(ProductId) ON DELETE SET NULL,
    FOREIGN KEY (OrderId) REFERENCES Orders(OrderId) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS Wishlists (
    WishlistId INTEGER PRIMARY KEY AUTOINCREMENT,
    UserId INTEGER NOT NULL,
    ProductId INTEGER NOT NULL,
    CreatedDate TEXT NOT NULL,
    UNIQUE(UserId, ProductId),
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE,
    FOREIGN KEY (ProductId) REFERENCES Products(ProductId) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS TranslationCache (
    CacheKey TEXT PRIMARY KEY,
    SourceLanguage TEXT NOT NULL,
    TargetLanguage TEXT NOT NULL,
    SourceText TEXT NOT NULL,
    TranslatedText TEXT NOT NULL,
    Provider TEXT NOT NULL,
    CreatedDate TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS Categories (
    CategoryId INTEGER PRIMARY KEY AUTOINCREMENT,
    CategoryName TEXT UNIQUE NOT NULL,
    Description TEXT NOT NULL DEFAULT '',
    IsActive INTEGER NOT NULL DEFAULT 1 CHECK(IsActive IN (0, 1)),
    CreatedDate TEXT NOT NULL,
    UpdatedDate TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS StoreSettings (
    SettingsId INTEGER PRIMARY KEY CHECK(SettingsId = 1),
    StoreName TEXT NOT NULL,
    Tagline TEXT NOT NULL DEFAULT '',
    Email TEXT NOT NULL,
    Phone TEXT NOT NULL DEFAULT '',
    Address TEXT NOT NULL DEFAULT '',
    BusinessDescription TEXT NOT NULL DEFAULT '',
    UpdatedDate TEXT NOT NULL,
    UpdatedBy INTEGER REFERENCES Users(UserId)
  );

  CREATE TABLE IF NOT EXISTS Products (
    ProductId INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductName TEXT NOT NULL,
    Description TEXT NOT NULL,
    Category TEXT NOT NULL,
    Price REAL NOT NULL CHECK(Price >= 0),
    ImageUrl TEXT,
    Quantity INTEGER NOT NULL DEFAULT 0 CHECK(Quantity >= 0),
    IsActive INTEGER NOT NULL DEFAULT 0 CHECK(IsActive IN (0, 1)),
    IsFeatured INTEGER NOT NULL DEFAULT 0 CHECK(IsFeatured IN (0, 1)),
    Fabric TEXT NOT NULL DEFAULT '',
    WeavingStyle TEXT NOT NULL DEFAULT '',
    Colour TEXT NOT NULL DEFAULT '',
    Occasion TEXT NOT NULL DEFAULT '',
    SareeLength TEXT NOT NULL DEFAULT '5.5 metres',
    BlousePieceIncluded INTEGER NOT NULL DEFAULT 1 CHECK(BlousePieceIncluded IN (0, 1)),
    CareInstructions TEXT NOT NULL DEFAULT '',
    Rating REAL NOT NULL DEFAULT 4.5 CHECK(Rating >= 0 AND Rating <= 5),
    CreatedDate TEXT NOT NULL,
    UpdatedDate TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_products_active ON Products(IsActive);
  CREATE INDEX IF NOT EXISTS idx_products_category ON Products(Category);
  CREATE INDEX IF NOT EXISTS idx_products_name ON Products(ProductName);
  CREATE INDEX IF NOT EXISTS idx_refresh_sessions_user ON RefreshSessions(UserId);
  CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_product ON NotificationSubscriptions(ProductId, IsSent);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON Notifications(UserId, IsRead, CreatedDate);
  CREATE INDEX IF NOT EXISTS idx_wishlists_user ON Wishlists(UserId, CreatedDate);
  CREATE INDEX IF NOT EXISTS idx_categories_active ON Categories(IsActive);
`);

const productColumns = db.prepare("PRAGMA table_info(Products)").all();
if (!productColumns.some((column) => column.name === "IsFeatured")) {
  db.exec("ALTER TABLE Products ADD COLUMN IsFeatured INTEGER NOT NULL DEFAULT 0 CHECK(IsFeatured IN (0, 1));");
}
const sareeProductColumns = [
  ["Fabric", "TEXT NOT NULL DEFAULT ''"], ["WeavingStyle", "TEXT NOT NULL DEFAULT ''"], ["Colour", "TEXT NOT NULL DEFAULT ''"], ["Occasion", "TEXT NOT NULL DEFAULT ''"], ["SareeLength", "TEXT NOT NULL DEFAULT '5.5 metres'"], ["BlousePieceIncluded", "INTEGER NOT NULL DEFAULT 1 CHECK(BlousePieceIncluded IN (0, 1))"], ["CareInstructions", "TEXT NOT NULL DEFAULT ''"], ["Rating", "REAL NOT NULL DEFAULT 4.5 CHECK(Rating >= 0 AND Rating <= 5)"]
];
for (const [name, definition] of sareeProductColumns) {
  if (!productColumns.some((column) => column.name === name)) db.exec(`ALTER TABLE Products ADD COLUMN ${name} ${definition};`);
}
db.exec("CREATE INDEX IF NOT EXISTS idx_products_featured ON Products(IsFeatured);");

const subscriptionColumns = db.prepare("PRAGMA table_info(NotificationSubscriptions)").all();
if (!subscriptionColumns.some((column) => column.name === "IsActive")) {
  db.exec("ALTER TABLE NotificationSubscriptions ADD COLUMN IsActive INTEGER NOT NULL DEFAULT 1 CHECK(IsActive IN (0, 1));");
}

const notificationColumns = db.prepare("PRAGMA table_info(Notifications)").all();
if (!notificationColumns.some((column) => column.name === "ReadDate")) {
  db.exec("ALTER TABLE Notifications ADD COLUMN ReadDate TEXT;");
}
if (!notificationColumns.some((column) => column.name === "OrderId")) {
  db.exec("ALTER TABLE Notifications ADD COLUMN OrderId INTEGER REFERENCES Orders(OrderId) ON DELETE SET NULL;");
}

const categoryColumns = db.prepare("PRAGMA table_info(Categories)").all();
if (!categoryColumns.some((column) => column.name === "UpdatedDate")) {
  db.exec("ALTER TABLE Categories ADD COLUMN UpdatedDate TEXT NOT NULL DEFAULT ''; ");
  db.prepare("UPDATE Categories SET UpdatedDate = CreatedDate WHERE UpdatedDate = ''").run();
}

const userColumns = db.prepare("PRAGMA table_info(Users)").all();
if (!userColumns.some((column) => column.name === "FullName")) {
  db.exec("ALTER TABLE Users ADD COLUMN FullName TEXT NOT NULL DEFAULT '';");
}
if (!userColumns.some((column) => column.name === "DisplayName")) {
  db.exec("ALTER TABLE Users ADD COLUMN DisplayName TEXT NOT NULL DEFAULT '';");
}
if (!userColumns.some((column) => column.name === "Email")) {
  db.exec("ALTER TABLE Users ADD COLUMN Email TEXT;");
}
if (!userColumns.some((column) => column.name === "AvatarUrl")) {
  db.exec("ALTER TABLE Users ADD COLUMN AvatarUrl TEXT;");
}
if (!userColumns.some((column) => column.name === "MobileNumber")) {
  db.exec("ALTER TABLE Users ADD COLUMN MobileNumber TEXT NOT NULL DEFAULT '';");
}
if (!userColumns.some((column) => column.name === "Preferences")) {
  db.exec("ALTER TABLE Users ADD COLUMN Preferences TEXT NOT NULL DEFAULT '{}';");
}
if (!userColumns.some((column) => column.name === "CreatedDate")) {
  db.exec("ALTER TABLE Users ADD COLUMN CreatedDate TEXT NOT NULL DEFAULT '';");
}
if (!userColumns.some((column) => column.name === "LastLogin")) {
  db.exec("ALTER TABLE Users ADD COLUMN LastLogin TEXT;");
}
if (!userColumns.some((column) => column.name === "OAuthProvider")) {
  db.exec("ALTER TABLE Users ADD COLUMN OAuthProvider TEXT;");
}
if (!userColumns.some((column) => column.name === "OAuthSubject")) {
  db.exec("ALTER TABLE Users ADD COLUMN OAuthSubject TEXT;");
}
if (!userColumns.some((column) => column.name === "IsEnabled")) {
  db.exec("ALTER TABLE Users ADD COLUMN IsEnabled INTEGER NOT NULL DEFAULT 1 CHECK(IsEnabled IN (0, 1));");
}
db.prepare("UPDATE Users SET CreatedDate = ? WHERE CreatedDate = ''").run(new Date().toISOString());
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON Users(Email) WHERE Email IS NOT NULL;");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mobile ON Users(MobileNumber) WHERE MobileNumber != '';");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth_identity ON Users(OAuthProvider, OAuthSubject) WHERE OAuthProvider IS NOT NULL AND OAuthSubject IS NOT NULL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS Inventory (
    InventoryId INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductId INTEGER NOT NULL UNIQUE,
    CurrentStock INTEGER NOT NULL DEFAULT 0 CHECK(CurrentStock >= 0),
    AvailableStock INTEGER NOT NULL DEFAULT 0 CHECK(AvailableStock >= 0),
    ReservedStock INTEGER NOT NULL DEFAULT 0 CHECK(ReservedStock >= 0),
    Status TEXT NOT NULL CHECK(Status IN ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK')),
    CreatedDate TEXT NOT NULL,
    UpdatedDate TEXT NOT NULL,
    FOREIGN KEY (ProductId) REFERENCES Products(ProductId) ON DELETE CASCADE,
    CHECK(AvailableStock + ReservedStock = CurrentStock)
  );

  CREATE TABLE IF NOT EXISTS InventoryAuditLog (
    AuditId INTEGER PRIMARY KEY AUTOINCREMENT,
    InventoryId INTEGER NOT NULL,
    ProductId INTEGER NOT NULL,
    AdminUserId INTEGER,
    Action TEXT NOT NULL CHECK(Action IN ('VIEWED', 'UPDATED', 'RESTOCKED', 'STATUS_CHANGED')),
    OldStock INTEGER,
    NewStock INTEGER,
    CreatedDate TEXT NOT NULL,
    FOREIGN KEY (InventoryId) REFERENCES Inventory(InventoryId) ON DELETE CASCADE,
    FOREIGN KEY (ProductId) REFERENCES Products(ProductId) ON DELETE CASCADE,
    FOREIGN KEY (AdminUserId) REFERENCES Users(UserId) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_inventory_status ON Inventory(Status);
  CREATE INDEX IF NOT EXISTS idx_inventory_audit_product ON InventoryAuditLog(ProductId, CreatedDate);
`);

db.prepare(`
  INSERT OR IGNORE INTO Inventory (ProductId, CurrentStock, AvailableStock, ReservedStock, Status, CreatedDate, UpdatedDate)
  SELECT ProductId, Quantity, Quantity, 0,
    CASE WHEN Quantity = 0 THEN 'OUT_OF_STOCK' WHEN Quantity <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END,
    CreatedDate, UpdatedDate
  FROM Products
`).run();

db.exec(`
  CREATE TABLE IF NOT EXISTS ProductAuditLog (
    AuditId INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductId INTEGER NOT NULL,
    UserId INTEGER,
    Action TEXT NOT NULL CHECK(Action IN ('CREATED', 'UPDATED', 'DELETED', 'ARCHIVED', 'RESTORED', 'VISIBILITY_CHANGED', 'INVENTORY_CHANGED')),
    OldValues TEXT,
    NewValues TEXT,
    CreatedDate TEXT NOT NULL,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_product_audit_product ON ProductAuditLog(ProductId, CreatedDate);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS Carts (
    CartId INTEGER PRIMARY KEY AUTOINCREMENT,
    UserId INTEGER NOT NULL UNIQUE,
    CreatedDate TEXT NOT NULL,
    UpdatedDate TEXT NOT NULL,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS CartItems (
    CartItemId INTEGER PRIMARY KEY AUTOINCREMENT,
    CartId INTEGER NOT NULL,
    ProductId INTEGER NOT NULL,
    Quantity INTEGER NOT NULL CHECK(Quantity > 0),
    UnitPrice REAL NOT NULL CHECK(UnitPrice >= 0),
    CreatedDate TEXT NOT NULL,
    UpdatedDate TEXT NOT NULL,
    UNIQUE(CartId, ProductId),
    FOREIGN KEY (CartId) REFERENCES Carts(CartId) ON DELETE CASCADE,
    FOREIGN KEY (ProductId) REFERENCES Products(ProductId) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS CartAuditLog (
    AuditId INTEGER PRIMARY KEY AUTOINCREMENT,
    CartId INTEGER NOT NULL,
    CartItemId INTEGER,
    UserId INTEGER NOT NULL,
    ProductId INTEGER,
    Action TEXT NOT NULL CHECK(Action IN ('ADDED', 'REMOVED', 'QUANTITY_UPDATED', 'CLEARED')),
    OldQuantity INTEGER,
    NewQuantity INTEGER,
    CreatedDate TEXT NOT NULL,
    FOREIGN KEY (CartId) REFERENCES Carts(CartId) ON DELETE CASCADE,
    FOREIGN KEY (CartItemId) REFERENCES CartItems(CartItemId) ON DELETE SET NULL,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE,
    FOREIGN KEY (ProductId) REFERENCES Products(ProductId) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON CartItems(CartId);
  CREATE INDEX IF NOT EXISTS idx_cart_audit_user ON CartAuditLog(UserId, CreatedDate);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS Addresses (
    AddressId INTEGER PRIMARY KEY AUTOINCREMENT,
    UserId INTEGER NOT NULL,
    FullName TEXT NOT NULL,
    MobileNumber TEXT NOT NULL,
    AddressLine1 TEXT NOT NULL,
    AddressLine2 TEXT NOT NULL DEFAULT '',
    City TEXT NOT NULL,
    State TEXT NOT NULL,
    PostalCode TEXT NOT NULL,
    Country TEXT NOT NULL DEFAULT 'India',
    IsDefault INTEGER NOT NULL DEFAULT 0 CHECK(IsDefault IN (0, 1)),
    CreatedDate TEXT NOT NULL,
    UpdatedDate TEXT NOT NULL,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS Orders (
    OrderId INTEGER PRIMARY KEY AUTOINCREMENT,
    UserId INTEGER NOT NULL,
    AddressId INTEGER NOT NULL,
    OrderNumber TEXT NOT NULL UNIQUE,
    IdempotencyKey TEXT,
    PaymentMethod TEXT NOT NULL DEFAULT 'COD',
    OrderStatus TEXT NOT NULL DEFAULT 'PENDING' CHECK(OrderStatus IN ('PENDING', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED')),
    SubTotal REAL NOT NULL CHECK(SubTotal >= 0),
    ShippingAmount REAL NOT NULL DEFAULT 0 CHECK(ShippingAmount >= 0),
    DiscountAmount REAL NOT NULL DEFAULT 0 CHECK(DiscountAmount >= 0),
    GrandTotal REAL NOT NULL CHECK(GrandTotal >= 0),
    CancelledAt TEXT,
    CancellationReason TEXT,
    RefundStatus TEXT NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK(RefundStatus IN ('NOT_APPLICABLE', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    RefundReference TEXT,
    CreatedDate TEXT NOT NULL,
    UpdatedDate TEXT NOT NULL,
    FOREIGN KEY (UserId) REFERENCES Users(UserId),
    FOREIGN KEY (AddressId) REFERENCES Addresses(AddressId)
  );

  CREATE TABLE IF NOT EXISTS OrderItems (
    OrderItemId INTEGER PRIMARY KEY AUTOINCREMENT,
    OrderId INTEGER NOT NULL,
    ProductId INTEGER NOT NULL,
    ProductName TEXT NOT NULL,
    ProductPrice REAL NOT NULL CHECK(ProductPrice >= 0),
    Quantity INTEGER NOT NULL CHECK(Quantity > 0),
    LineTotal REAL NOT NULL CHECK(LineTotal >= 0),
    CreatedDate TEXT NOT NULL,
    FOREIGN KEY (OrderId) REFERENCES Orders(OrderId) ON DELETE CASCADE,
    FOREIGN KEY (ProductId) REFERENCES Products(ProductId)
  );

  CREATE TABLE IF NOT EXISTS OrderAuditLog (
    AuditId INTEGER PRIMARY KEY AUTOINCREMENT,
    OrderId INTEGER,
    UserId INTEGER NOT NULL,
    Action TEXT NOT NULL CHECK(Action IN ('ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_CANCELLED', 'INVENTORY_DEDUCTED', 'ADDRESS_ADDED')),
    CreatedDate TEXT NOT NULL,
    FOREIGN KEY (OrderId) REFERENCES Orders(OrderId) ON DELETE SET NULL,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_addresses_user ON Addresses(UserId, IsDefault);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON Orders(UserId, CreatedDate);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency ON Orders(UserId, IdempotencyKey) WHERE IdempotencyKey IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON OrderItems(OrderId);
  CREATE INDEX IF NOT EXISTS idx_order_audit_user ON OrderAuditLog(UserId, CreatedDate);
`);

const orderColumns = db.prepare("PRAGMA table_info(Orders)").all();
if (!orderColumns.some((column) => column.name === "IdempotencyKey")) {
  db.exec("ALTER TABLE Orders ADD COLUMN IdempotencyKey TEXT;");
}
if (!orderColumns.some((column) => column.name === "PaymentMethod")) {
  db.exec("ALTER TABLE Orders ADD COLUMN PaymentMethod TEXT NOT NULL DEFAULT 'COD';");
}
if (!orderColumns.some((column) => column.name === "CancelledAt")) db.exec("ALTER TABLE Orders ADD COLUMN CancelledAt TEXT;");
if (!orderColumns.some((column) => column.name === "CancellationReason")) db.exec("ALTER TABLE Orders ADD COLUMN CancellationReason TEXT;");
if (!orderColumns.some((column) => column.name === "RefundStatus")) db.exec("ALTER TABLE Orders ADD COLUMN RefundStatus TEXT NOT NULL DEFAULT 'NOT_APPLICABLE';");
if (!orderColumns.some((column) => column.name === "RefundReference")) db.exec("ALTER TABLE Orders ADD COLUMN RefundReference TEXT;");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency ON Orders(UserId, IdempotencyKey) WHERE IdempotencyKey IS NOT NULL;");

const ordersTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'Orders'").get();
if (ordersTable?.sql && !ordersTable.sql.includes("OUT_FOR_DELIVERY")) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE Orders_new (
      OrderId INTEGER PRIMARY KEY AUTOINCREMENT,
      UserId INTEGER NOT NULL,
      AddressId INTEGER NOT NULL,
      OrderNumber TEXT NOT NULL UNIQUE,
      IdempotencyKey TEXT,
      PaymentMethod TEXT NOT NULL DEFAULT 'COD',
      OrderStatus TEXT NOT NULL DEFAULT 'PENDING' CHECK(OrderStatus IN ('PENDING', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED')),
      SubTotal REAL NOT NULL CHECK(SubTotal >= 0),
      ShippingAmount REAL NOT NULL DEFAULT 0 CHECK(ShippingAmount >= 0),
      DiscountAmount REAL NOT NULL DEFAULT 0 CHECK(DiscountAmount >= 0),
      GrandTotal REAL NOT NULL CHECK(GrandTotal >= 0),
      CancelledAt TEXT,
      CancellationReason TEXT,
      RefundStatus TEXT NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK(RefundStatus IN ('NOT_APPLICABLE', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
      RefundReference TEXT,
      CreatedDate TEXT NOT NULL,
      UpdatedDate TEXT NOT NULL,
      FOREIGN KEY (UserId) REFERENCES Users(UserId),
      FOREIGN KEY (AddressId) REFERENCES Addresses(AddressId)
    );
    INSERT INTO Orders_new (OrderId, UserId, AddressId, OrderNumber, IdempotencyKey, PaymentMethod, OrderStatus, SubTotal, ShippingAmount, DiscountAmount, GrandTotal, CancelledAt, CancellationReason, RefundStatus, RefundReference, CreatedDate, UpdatedDate)
      SELECT OrderId, UserId, AddressId, OrderNumber, IdempotencyKey, COALESCE(PaymentMethod, 'COD'),
        CASE OrderStatus
          WHEN 'Pending' THEN 'PENDING'
          WHEN 'Confirmed' THEN 'PENDING'
          WHEN 'Processing' THEN 'PROCESSING'
          WHEN 'Packed' THEN 'PACKED'
          WHEN 'Shipped' THEN 'SHIPPED'
          WHEN 'Delivered' THEN 'DELIVERED'
          WHEN 'Cancelled' THEN 'CANCELLED'
          ELSE OrderStatus
        END,
        SubTotal, ShippingAmount, DiscountAmount, GrandTotal, CancelledAt, CancellationReason, COALESCE(RefundStatus, 'NOT_APPLICABLE'), RefundReference, CreatedDate, UpdatedDate
      FROM Orders;
    DROP TABLE Orders;
    ALTER TABLE Orders_new RENAME TO Orders;
    PRAGMA foreign_keys = ON;
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_user ON Orders(UserId, CreatedDate);");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency ON Orders(UserId, IdempotencyKey) WHERE IdempotencyKey IS NOT NULL;");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS OrderStatusHistory (
    StatusHistoryId INTEGER PRIMARY KEY AUTOINCREMENT,
    OrderId INTEGER NOT NULL,
    OldStatus TEXT,
    NewStatus TEXT NOT NULL,
    ChangedBy INTEGER,
    ChangedAt TEXT NOT NULL,
    FOREIGN KEY (OrderId) REFERENCES Orders(OrderId) ON DELETE CASCADE,
    FOREIGN KEY (ChangedBy) REFERENCES Users(UserId) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON OrderStatusHistory(OrderId, ChangedAt);
`);

db.exec(`
  UPDATE Orders SET OrderStatus = CASE OrderStatus
    WHEN 'Pending' THEN 'PENDING'
    WHEN 'Confirmed' THEN 'CONFIRMED'
    WHEN 'Processing' THEN 'PROCESSING'
    WHEN 'Packed' THEN 'PACKED'
    WHEN 'Shipped' THEN 'SHIPPED'
    WHEN 'Delivered' THEN 'DELIVERED'
    WHEN 'Cancelled' THEN 'CANCELLED'
    ELSE OrderStatus
  END;
`);
