const express = require("express");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3003;
const JWT_SECRET = process.env.JWT_SECRET || "supersecret-dev";
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || "http://localhost:3002";

// In-memory orders
const orders = new Map();
let nextId = 1;

// Auth middleware
const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(header.replace("Bearer ", ""), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Injected HTTP client (enables mocking in tests)
let httpClient = null;

const getHttpClient = () => {
  if (httpClient) return httpClient;
  return require("node-fetch");
};

app.set("getHttpClient", getHttpClient);

// Allow tests to inject a mock HTTP client
const setHttpClient = (client) => { httpClient = client; };

// POST /orders
app.post("/orders", authenticate, async (req, res) => {
  const { items } = req.body; // [{ productId, quantity }]
  if (!items || !Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: "items array is required" });

  const fetch = getHttpClient();

  // Validate products and check stock
  let total = 0;
  const resolvedItems = [];
  for (const item of items) {
    const productRes = await fetch(`${PRODUCT_SERVICE_URL}/products/${item.productId}`);
    if (!productRes.ok) {
      return res.status(422).json({ error: `Product ${item.productId} not found` });
    }
    const product = await productRes.json();
    if (product.stock < item.quantity) {
      return res.status(422).json({ error: `Insufficient stock for product ${item.productId}` });
    }
    total += product.price * item.quantity;
    resolvedItems.push({ productId: product.id, name: product.name, quantity: item.quantity, unitPrice: product.price });
  }

  // Decrement stock for each item
  for (const item of items) {
    await fetch(`${PRODUCT_SERVICE_URL}/products/${item.productId}/stock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decrement: item.quantity }),
    });
  }

  const order = {
    id: nextId++,
    userId: req.user.id,
    items: resolvedItems,
    total: parseFloat(total.toFixed(2)),
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };
  orders.set(order.id, order);

  res.status(201).json(order);
});

// GET /orders  (returns orders for the authenticated user)
app.get("/orders", authenticate, (req, res) => {
  const userOrders = [...orders.values()].filter((o) => o.userId === req.user.id);
  res.json(userOrders);
});

// GET /orders/:id
app.get("/orders/:id", authenticate, (req, res) => {
  const order = orders.get(parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
  res.json(order);
});

// GET /health
app.get("/health", (_, res) => res.json({ status: "ok", service: "order-service" }));

module.exports = { app, orders, setHttpClient };

if (require.main === module) {
  app.listen(PORT, () => console.log("Order service running on :" + PORT));
}
