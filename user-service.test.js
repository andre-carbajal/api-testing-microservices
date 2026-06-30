/**
 * user-service.test.js
 *
 * Tests for authentication and user profile endpoints.
 * Uses Supertest to spin up the Express app in-process — no running server needed.
 */
const request = require("supertest");
const { app, users } = require("../../services/user-service/src/index");

// ── Helpers ──────────────────────────────────────────────────────────────────

const registerUser = (overrides = {}) =>
  request(app)
    .post("/auth/register")
    .send({ name: "Alice", email: "alice@example.com", password: "Pass1234!", ...overrides });

const loginUser = (email = "alice@example.com", password = "Pass1234!") =>
  request(app).post("/auth/login").send({ email, password });

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  users.clear(); // reset state between tests
});

// ── POST /auth/register ───────────────────────────────────────────────────────

describe("POST /auth/register", () => {
  it("creates a new user and returns 201 with user data (no password)", async () => {
    const res = await registerUser();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Alice", email: "alice@example.com", role: "user" });
    expect(res.body).not.toHaveProperty("password");
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app).post("/auth/register").send({ email: "alice@example.com" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 409 when email is already registered", async () => {
    await registerUser();
    const res = await registerUser(); // duplicate
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await registerUser();
  });

  it("returns a JWT token on valid credentials", async () => {
    const res = await loginUser();
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(typeof res.body.token).toBe("string");
  });

  it("returns 401 on wrong password", async () => {
    const res = await loginUser("alice@example.com", "wrongpassword");
    expect(res.status).toBe(401);
  });

  it("returns 401 on unknown email", async () => {
    const res = await loginUser("nobody@example.com", "Pass1234!");
    expect(res.status).toBe(401);
  });
});

// ── GET /users/me ─────────────────────────────────────────────────────────────

describe("GET /users/me", () => {
  let token;

  beforeEach(async () => {
    await registerUser();
    const res = await loginUser();
    token = res.body.token;
  });

  it("returns profile for authenticated user", async () => {
    const res = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: "alice@example.com" });
  });

  it("returns 401 when no token is provided", async () => {
    const res = await request(app).get("/users/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 on malformed token", async () => {
    const res = await request(app)
      .get("/users/me")
      .set("Authorization", "Bearer not.a.valid.token");
    expect(res.status).toBe(401);
  });
});

// ── GET /health ───────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 with service name", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", service: "user-service" });
  });
});
