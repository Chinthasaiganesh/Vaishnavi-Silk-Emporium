import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "..", "data");
const uploadsDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export const db = new DatabaseSync(path.join(dataDir, "catalog.db"));

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
    OAuthSubject TEXT
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

const usersTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'Users'").get();
if (usersTable?.sql?.includes("'USER'") === false) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE Users_new (
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
      LastLogin TEXT
    );
    INSERT INTO Users_new (UserId, Username, PasswordHash, Role)
      SELECT UserId, Username, PasswordHash, Role FROM Users;
    DROP TABLE Users;
    ALTER TABLE Users_new RENAME TO Users;
    PRAGMA foreign_keys = ON;
  `);
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
db.prepare("UPDATE Users SET CreatedDate = ? WHERE CreatedDate = ''").run(new Date().toISOString());
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON Users(Email) WHERE Email IS NOT NULL;");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mobile ON Users(MobileNumber) WHERE MobileNumber != '';");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth_identity ON Users(OAuthProvider, OAuthSubject) WHERE OAuthProvider IS NOT NULL AND OAuthSubject IS NOT NULL;");
