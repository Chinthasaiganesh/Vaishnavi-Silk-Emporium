import bcrypt from "bcryptjs";
import { db } from "./db.js";
import { config } from "./config.js";
import { nowIso } from "./utils.js";

const existingAdmin = db
  .prepare("SELECT UserId FROM Users WHERE Username = ?")
  .get(config.adminUsername);

if (!existingAdmin) {
  const hash = await bcrypt.hash(config.adminPassword, 12);
  db.prepare("INSERT INTO Users (Username, PasswordHash, Role) VALUES (?, ?, 'ADMIN')").run(
    config.adminUsername,
    hash
  );
}

const existingUser = db
  .prepare("SELECT UserId FROM Users WHERE Username = ?")
  .get(config.userUsername);

if (!existingUser) {
  const hash = await bcrypt.hash(config.userPassword, 12);
  db.prepare("INSERT INTO Users (Username, PasswordHash, Role) VALUES (?, ?, 'USER')").run(
    config.userUsername,
    hash
  );
}

db.prepare("UPDATE Users SET FullName = ?, DisplayName = ?, Email = ? WHERE Username = ?").run(
  "BlueOrbit Administrator",
  "Admin",
  "admin@blueorbit.example",
  config.adminUsername
);
db.prepare("UPDATE Users SET FullName = ?, DisplayName = ?, Email = ? WHERE Username = ?").run(
  "BlueOrbit Customer",
  "Customer",
  "customer@blueorbit.example",
  config.userUsername
);

const productsCount = db.prepare("SELECT COUNT(*) as count FROM Products").get().count;

if (productsCount === 0) {
  const insert = db.prepare(`
    INSERT INTO Products
      (ProductName, Description, Category, Price, ImageUrl, Quantity, IsActive, IsFeatured, CreatedDate, UpdatedDate)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedProducts = [
    [
      "Executive Laptop",
      "High-performance laptop for business professionals.",
      "Electronics",
      1299,
      "https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?auto=format&fit=crop&w=1200&q=80",
      32,
      1,
      1
    ],
    [
      "Ergonomic Office Chair",
      "Lumbar support chair with breathable mesh back.",
      "Furniture",
      249,
      "https://images.unsplash.com/photo-1582582494700-04fc4f7f6f3e?auto=format&fit=crop&w=1200&q=80",
      18,
      1,
      1
    ],
    [
      "Wireless Conference Speaker",
      "Crystal-clear audio for hybrid meeting rooms.",
      "Electronics",
      159,
      "https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=1200&q=80",
      0,
      1,
      0
    ]
  ];

  const created = nowIso();
  for (const p of seedProducts) {
    insert.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], created, created);
  }
}

const updateSaree = db.prepare(`
  UPDATE Products SET ProductName = ?, Description = ?, Category = ?, Price = ?, ImageUrl = ?, Quantity = ?, IsFeatured = ?, Fabric = ?, WeavingStyle = ?, Colour = ?, Occasion = ?, SareeLength = '5.5 metres', BlousePieceIncluded = 1, CareInstructions = 'Dry clean only. Store folded in a muslin cloth.', Rating = ?, UpdatedDate = ? WHERE ProductId = ?
`);
const now = nowIso();
const sarees = [
  ["Royal Kanchipuram Silk Saree", "Handwoven pure silk saree with a rich zari border for timeless celebrations.", "Kanchipuram Sarees", 18999, "https://images.unsplash.com/photo-1610189020380-dc0d7a3e743d?auto=format&fit=crop&w=1200&q=85", 12, 1, "Pure Silk", "Kanchipuram Handloom", "Maroon & Gold", "Wedding Collection", 4.9, 1],
  ["Banarasi Floral Zari Saree", "Elegant Banarasi weave with delicate floral motifs and festive gold detailing.", "Banarasi Sarees", 12999, "https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&w=1200&q=85", 8, 1, "Silk Blend", "Banarasi Zari", "Crimson", "Festival Collection", 4.8, 2],
  ["Indigo Handloom Cotton Saree", "Breathable handloom cotton saree designed for graceful everyday elegance.", "Cotton Sarees", 3499, "https://images.unsplash.com/photo-1594736797933-d0c96e874fcb?auto=format&fit=crop&w=1200&q=85", 0, 0, "Cotton", "Handloom", "Indigo Blue", "Office Wear", 4.6, 3]
];
for (const saree of sarees) updateSaree.run(...saree.slice(0, -1), now, saree.at(-1));

const categoryDescriptions = {
  "Silk Sarees": "Luxurious silk sarees for timeless occasions.",
  "Banarasi Sarees": "Elegant Banarasi weaves with traditional zari artistry.",
  "Kanchipuram Sarees": "Heritage Kanchipuram silks for celebrations and weddings.",
  "Cotton Sarees": "Breathable cotton sarees for graceful everyday wear.",
  "Bridal Sarees": "Statement sarees curated for bridal moments.",
  "Designer Sarees": "Contemporary drapes with signature detailing.",
  "Festive Sarees": "Vibrant sarees for festivals and traditional events.",
  "Linen Sarees": "Lightweight linen weaves with effortless elegance.",
  "Handloom Sarees": "Artisan handloom sarees celebrating Indian craft."
};
const insertCategory = db.prepare("INSERT OR IGNORE INTO Categories (CategoryName, Description, IsActive, CreatedDate, UpdatedDate) VALUES (?, ?, 1, ?, ?)");
for (const [name, description] of Object.entries(categoryDescriptions)) insertCategory.run(name, description, now, now);
for (const row of db.prepare("SELECT DISTINCT Category FROM Products WHERE Category != ''").all()) insertCategory.run(row.Category, categoryDescriptions[row.Category] || "Saree collection.", now, now);

db.prepare("INSERT OR IGNORE INTO StoreSettings (SettingsId, StoreName, Tagline, Email, Phone, Address, BusinessDescription, UpdatedDate, UpdatedBy) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)").run(
  "Vaishnavi Silk Emporium",
  "Where Tradition Meets Elegance",
  "care@vaishnavisilks.example",
  "+91 90000 00000",
  "Hyderabad, Telangana",
  "Vaishnavi Silk Emporium curates timeless silk, cotton, handloom, Banarasi and Kanchipuram sarees for every occasion.",
  now,
  existingAdmin?.UserId || null
);

console.log("Seed complete.");
