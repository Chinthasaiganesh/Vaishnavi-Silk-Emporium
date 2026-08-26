# API Design

## Auth

### POST /api/auth/login
Request:
{
  "username": "admin",
  "password": "Admin@12345"
}

Response 200:
{
  "token": "<jwt>",
  "user": {
    "userId": 1,
    "username": "admin",
    "role": "ADMIN"
  }
}

## Products (Public)

### GET /api/products/public?q=&category=&sort=
- q: keyword search (name/category/description)
- category: exact category filter
- sort: price_asc | price_desc | alpha_asc

Response 200:
{
  "products": [
    {
      "productId": 1,
      "productName": "Executive Laptop",
      "description": "High-performance laptop",
      "category": "Electronics",
      "price": 1299,
      "imageUrl": "...",
      "quantity": 32,
      "isActive": true,
      "availabilityStatus": "In Stock",
      "createdDate": "...",
      "updatedDate": "..."
    }
  ]
}

### GET /api/products/public/:id
Returns a single active product.

## Products (Admin)
Authorization: Bearer <jwt>

### GET /api/products/admin
Returns all products including inactive.

### GET /api/products/admin/summary
Returns:
{
  "totalProducts": 10,
  "activeProducts": 8,
  "lowStockProducts": 2
}

### POST /api/products/admin
Content-Type: multipart/form-data
Fields:
- productName
- description
- category
- price
- quantity
- isActive
- imageUrl (optional)
- image (optional file)

### PUT /api/products/admin/:id
Same payload as POST.

### DELETE /api/products/admin/:id
Deletes product.
