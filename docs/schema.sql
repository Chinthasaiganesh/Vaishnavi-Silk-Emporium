-- ARCHIVED SQLITE SNAPSHOT. This file is retained for historical reference only.
-- Do not apply it to the current application database.
-- Runtime schema: ../backend/src/db.js. Table reference: DATABASE_SCHEMA.md.
/*
CREATE TABLE Users (
  UserId INTEGER PRIMARY KEY AUTOINCREMENT,
  Username TEXT UNIQUE NOT NULL,
  PasswordHash TEXT NOT NULL,
  Role TEXT NOT NULL CHECK (Role IN ('ADMIN', 'USER'))
);

CREATE TABLE Products (
  ProductId INTEGER PRIMARY KEY AUTOINCREMENT,
  ProductName TEXT NOT NULL,
  Description TEXT NOT NULL,
  Category TEXT NOT NULL,
  Price REAL NOT NULL CHECK (Price >= 0),
  DiscountedPrice REAL CHECK (DiscountedPrice IS NULL OR (DiscountedPrice >= 0 AND DiscountedPrice <= Price)),
  ImageUrl TEXT,
  Quantity INTEGER NOT NULL DEFAULT 0 CHECK (Quantity >= 0),
  IsActive INTEGER NOT NULL DEFAULT 0 CHECK (IsActive IN (0, 1)),
  IsFeatured INTEGER NOT NULL DEFAULT 0 CHECK (IsFeatured IN (0, 1)),
  CreatedDate TEXT NOT NULL,
  UpdatedDate TEXT NOT NULL
);


CREATE INDEX idx_products_active ON Products(IsActive);
CREATE INDEX idx_products_category ON Products(Category);
CREATE INDEX idx_products_name ON Products(ProductName);
CREATE INDEX idx_products_featured ON Products(IsFeatured);
*/
