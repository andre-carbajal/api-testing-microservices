/**
 * order-service.test.js
 *
 * Tests for order creation and retrieval.
 * The order-service calls product-service over HTTP — we mock that HTTP client
 * so tests stay fast and isolated (no running product-service needed).
 */
const request = require("supertest");
const jwt = require("jsonwebtoken");
const { app, orders, setHttpClient } = require("../../services/order-service/src/index");

const JWT_SECRET = "supersecret-dev";

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeToken = (userId = 1) =>
  jwt.sign({ id: userId, email: "alice@example.com", role: "user" }, JWT_SECRET, { expiresIn: "1h" });

/**
 * Creates a minimal fetch mock that responds to product-service routes.
 * - GET /products/:id  → returns product data
 * - PATCH /products/:id/stock → returns updated product
 */
const mockFetch = (productOverrides = {}) => {
  const defaultProduct = {
    id: 1,
    name: "Mechanical Keyboard",
    price: 129.99,
    stock: 50,
    category: "electronics",
    ...productOverrides,
  };

  return jest.fn().mockImplementation((url, options = {}) => {
    const method = options.method || "GET";

    if (method === "GET" && url.includes("/products/")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(defaultProduct),
      });
    }

    if (method === "PATCH" && url.includes("/stock")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...defaultProduct, stock: defaultProduct.stock - 2 }),
      });
    }

    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
  });
};

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  orders.clear();
});

afterEach(() => {
  setHttpClient(null); // restore real fetch between tests
});

// ── POST /orders ──────────────────────────────────────────────────────────────

describe("POST /orders", () => {
  it("creates an order and returns 201 with confirmed status", async () => {
    setHttpClient(mockFetch());
    const token = makeToken();

    const res = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: 1, quantity: 2 }] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "confirmed",
      userId: 1,
      total: 259.98, // 129.99 * 2
    });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ productId: 1, quantity: 2 });
  });

  it("returns 401 when no token is provided", async () => {
    const res = await request(app)
      .post("/orders")
      .send({ items: [{ productId: 1, quantity: 1 }] });
    expect(res.status).toBe(401);
  });

  it("returns 400 when items array is missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 422 when product does not exist", async () => {
    // mock fetch returns a 404 for the product
    const failFetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Product not found" }),
    });
    setHttpClient(failFetch);

    const token = makeToken();
    const res = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: 999, quantity: 1 }] });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 422 when stock is insufficient", async () => {
    setHttpClient(mockFetch({ stock: 1 })); // only 1 unit in stock
    const token = makeToken();

    const res = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: 1, quantity: 5 }] }); // requesting 5

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/insufficient stock/i);
  });
});

// ── GET /orders ───────────────────────────────────────────────────────────────

describe("GET /orders", () => {
  it("returns only orders belonging to the authenticated user", async () => {
    // Seed orders for two different users
    orders.set(1, { id: 1, userId: 1, items: [], total: 50, status: "confirmed", createdAt: new Date().toISOString() });
    orders.set(2, { id: 2, userId: 2, items: [], total: 80, status: "confirmed", createdAt: new Date().toISOString() });

    const token = makeToken(1);
    const res = await request(app)
      .get("/orders")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].userId).toBe(1);
  });
});

// ── GET /orders/:id ───────────────────────────────────────────────────────────

describe("GET /orders/:id", () => {
  beforeEach(() => {
    orders.set(1, { id: 1, userId: 1, items: [], total: 50, status: "confirmed", createdAt: new Date().toISOString() });
  });

  it("returns the order for the owner", async () => {
    const token = makeToken(1);
    const res = await request(app)
      .get("/orders/1")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it("returns 403 when another user tries to access the order", async () => {
    const token = makeToken(2); // different user
    const res = await request(app)
      .get("/orders/1")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown order", async () => {
    const token = makeToken(1);
    const res = await request(app)
      .get("/orders/999")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
