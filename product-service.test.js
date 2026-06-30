/**
 * product-service.test.js
 *
 * Tests for the product catalog including filtering and stock management.
 */
const request = require("supertest");
const { app, products } = require("../../services/product-service/src/index");

// ── Lifecycle ─────────────────────────────────────────────────────────────────

const INITIAL_PRODUCTS = [
  { id: 1, name: "Mechanical Keyboard", price: 129.99, stock: 50, category: "electronics" },
  { id: 2, name: "USB-C Hub", price: 49.99, stock: 120, category: "electronics" },
  { id: 3, name: "Ergonomic Mouse", price: 79.99, stock: 30, category: "electronics" },
];

beforeEach(() => {
  products.clear();
  INITIAL_PRODUCTS.forEach((p) => products.set(p.id, { ...p }));
});

// ── GET /products ─────────────────────────────────────────────────────────────

describe("GET /products", () => {
  it("returns all products", async () => {
    const res = await request(app).get("/products");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  it("filters by category", async () => {
    const res = await request(app).get("/products?category=electronics");
    expect(res.status).toBe(200);
    res.body.forEach((p) => expect(p.category).toBe("electronics"));
  });

  it("filters by price range", async () => {
    const res = await request(app).get("/products?minPrice=60&maxPrice=100");
    expect(res.status).toBe(200);
    res.body.forEach((p) => {
      expect(p.price).toBeGreaterThanOrEqual(60);
      expect(p.price).toBeLessThanOrEqual(100);
    });
  });
});

// ── GET /products/:id ─────────────────────────────────────────────────────────

describe("GET /products/:id", () => {
  it("returns a single product", async () => {
    const res = await request(app).get("/products/1");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: "Mechanical Keyboard" });
  });

  it("returns 404 for unknown product", async () => {
    const res = await request(app).get("/products/999");
    expect(res.status).toBe(404);
  });
});

// ── POST /products ────────────────────────────────────────────────────────────

describe("POST /products", () => {
  const newProduct = { name: "Standing Desk", price: 499.99, stock: 10, category: "furniture" };

  it("creates a product and returns 201", async () => {
    const res = await request(app).post("/products").send(newProduct);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject(newProduct);
    expect(res.body).toHaveProperty("id");
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app).post("/products").send({ name: "Incomplete" });
    expect(res.status).toBe(400);
  });
});

// ── PATCH /products/:id/stock ─────────────────────────────────────────────────

describe("PATCH /products/:id/stock", () => {
  it("decrements stock successfully", async () => {
    const res = await request(app)
      .patch("/products/1/stock")
      .send({ decrement: 5 });
    expect(res.status).toBe(200);
    expect(res.body.stock).toBe(45); // 50 - 5
  });

  it("returns 422 when stock is insufficient", async () => {
    const res = await request(app)
      .patch("/products/1/stock")
      .send({ decrement: 999 });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/insufficient stock/i);
  });

  it("returns 400 for invalid decrement value", async () => {
    const res = await request(app)
      .patch("/products/1/stock")
      .send({ decrement: 0 });
    expect(res.status).toBe(400);
  });
});
