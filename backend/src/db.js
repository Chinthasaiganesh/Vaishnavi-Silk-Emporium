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
    Type TEXT NOT NULL,
    Title TEXT NOT NULL,
    Message TEXT NOT NULL,
    IsRead INTEGER NOT NULL DEFAULT 0 CHECK(IsRead IN (0, 1)),
    CreatedDate TEXT NOT NULL,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE,
    FOREIGN KEY (ProductId) REFERENCES Products(ProductId) ON DELETE SET NULL
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
