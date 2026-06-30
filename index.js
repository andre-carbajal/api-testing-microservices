const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "supersecret-dev";

// In-memory store (replace with DB in production)
const users = new Map();
let nextId = 1;

// POST /auth/register
app.post("/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "name, email and password are required" });
  if (users.has(email))
    return res.status(409).json({ error: "Email already registered" });
  const hashed = await bcrypt.hash(password, 10);
  const user = { id: nextId++, name, email, password: hashed, role: "user" };
  users.set(email, user);
  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

// POST /auth/login
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = users.get(email);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
  res.json({ token });
});

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

// GET /users/me
app.get("/users/me", authenticate, (req, res) => {
  const user = [...users.values()].find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

// GET /users/:id  (internal service-to-service)
app.get("/users/:id", (req, res) => {
  const user = [...users.values()].find((u) => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

// GET /health
app.get("/health", (_, res) => res.json({ status: "ok", service: "user-service" }));

module.exports = { app, users };

if (require.main === module) {
  app.listen(PORT, () => console.log("User service running on :" + PORT));
}
