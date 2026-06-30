const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;

// In-memory product catalog
const products = new Map([
  [1, { id: 1, name: "Mechanical Keyboard", price: 129.99, stock: 50, category: "electronics" }],
  [2, { id: 2, name: "USB-C Hub", price: 49.99, stock: 120, category: "electronics" }],
  [3, { id: 3, name: "Ergonomic Mouse", price: 79.99, stock: 30, category: "electronics" }],
]);
let nextId = 4;

// GET /products
app.get("/products", (req, res) => {
  const { category, minPrice, maxPrice } = req.query;
  let result = [...products.values()];
  if (category) result = result.filter((p) => p.category === category);
  if (minPrice) result = result.filter((p) => p.price >= parseFloat(minPrice));
  if (maxPrice) result = result.filter((p) => p.price <= parseFloat(maxPrice));
  res.json(result);
});

// GET /products/:id
app.get("/products/:id", (req, res) => {
  const product = products.get(parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

// POST /products
app.post("/products", (req, res) => {
  const { name, price, stock, category } = req.body;
  if (!name || price == null || stock == null || !category)
    return res.status(400).json({ error: "name, price, stock and category are required" });
  const product = { id: nextId++, name, price, stock, category };
  products.set(product.id, product);
  res.status(201).json(product);
});

// PATCH /products/:id/stock  (used by order-service to decrement stock)
app.patch("/products/:id/stock", (req, res) => {
  const product = products.get(parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: "Product not found" });
  const { decrement } = req.body;
  if (decrement == null || decrement < 1)
    return res.status(400).json({ error: "decrement must be a positive integer" });
  if (product.stock < decrement)
    return res.status(422).json({ error: "Insufficient stock" });
  product.stock -= decrement;
  res.json(product);
});

// GET /health
app.get("/health", (_, res) => res.json({ status: "ok", service: "product-service" }));

module.exports = { app, products };

if (require.main === module) {
  app.listen(PORT, () => console.log("Product service running on :" + PORT));
}
