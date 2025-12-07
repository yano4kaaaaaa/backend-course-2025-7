require("dotenv").config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");
const mysql = require("mysql2/promise");
const fs = require("fs");

// ==========================
// MySQL підключення
// ==========================
let db;

async function initDB() {
  db = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });

  console.log("✅ MySQL connected!");
}

initDB().catch(err => {
  console.error("❌ Database connection failed:", err);
  process.exit(1);
});


// ==========================
// Express + Multer
// ==========================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Папка з фото (в контейнері /app/photos)
const PHOTOS_DIR = path.join(__dirname, "photos");
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const upload = multer({
  dest: PHOTOS_DIR
});

// ==========================
// Swagger
// ==========================
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Inventory Service API",
      version: "1.0.0",
      description: "Web API for inventory management (Lab 7, Docker + DB)"
    }
  },
  apis: ["./index.js"]
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));


// ========================================================================
// POST /register — CREATE
// ========================================================================
app.post("/register", upload.single("photo"), async (req, res) => {
  try {
    const { inventory_name, description } = req.body;

    if (!inventory_name) {
      return res.status(400).json({ error: "inventory_name is required" });
    }

    const [result] = await db.query(
      "INSERT INTO inventory (inventory_name, description, photo) VALUES (?,?,?)",
      [inventory_name, description || "", req.file ? req.file.filename : null]
    );

    const inserted = {
      id: result.insertId,
      inventory_name,
      description,
      photo: req.file ? req.file.filename : null
    };

    res.status(201).json(inserted);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB error" });
  }
});


// ========================================================================
// GET /inventory — READ ALL
// ========================================================================
app.get("/inventory", async (req, res) => {
  const [rows] = await db.query("SELECT * FROM inventory");
  res.json(rows);
});


// ========================================================================
// GET /inventory/:id — READ ONE
// ========================================================================
app.get("/inventory/:id", async (req, res) => {
  const [rows] = await db.query("SELECT * FROM inventory WHERE id = ?", [
    req.params.id,
  ]);

  if (rows.length === 0) return res.status(404).json({ error: "Not found" });

  res.json(rows[0]);
});


// ========================================================================
// PUT /inventory/:id — UPDATE
// ========================================================================
app.put("/inventory/:id", async (req, res) => {
  const { inventory_name, description } = req.body;

  const [rows] = await db.query("SELECT * FROM inventory WHERE id = ?", [
    req.params.id,
  ]);

  if (rows.length === 0) return res.status(404).json({ error: "Not found" });

  await db.query(
    "UPDATE inventory SET inventory_name = ?, description = ? WHERE id = ?",
    [inventory_name || rows[0].inventory_name,
     description || rows[0].description,
     req.params.id]
  );

  res.json({ message: "Updated" });
});


// ========================================================================
// GET /inventory/:id/photo — READ PHOTO
// ========================================================================
app.get("/inventory/:id/photo", async (req, res) => {
  const [rows] = await db.query("SELECT photo FROM inventory WHERE id = ?", [
    req.params.id,
  ]);

  if (rows.length === 0 || !rows[0].photo)
    return res.status(404).send("Photo not found");

  const filePath = path.join(PHOTOS_DIR, rows[0].photo);

  if (!fs.existsSync(filePath))
    return res.status(404).send("File missing");

  res.sendFile(filePath);
});


// ========================================================================
// PUT /inventory/:id/photo — UPDATE PHOTO
// ========================================================================
app.put("/inventory/:id/photo", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing file" });

  const [rows] = await db.query("SELECT * FROM inventory WHERE id = ?", [
    req.params.id,
  ]);

  if (rows.length === 0) return res.status(404).json({ error: "Not found" });

  await db.query("UPDATE inventory SET photo = ? WHERE id = ?", [
    req.file.filename,
    req.params.id,
  ]);

  res.json({ message: "Photo updated" });
});


// ========================================================================
// DELETE
// ========================================================================
app.delete("/inventory/:id", async (req, res) => {
  const [rows] = await db.query("SELECT * FROM inventory WHERE id = ?", [
    req.params.id,
  ]);

  if (rows.length === 0) return res.status(404).json({ error: "Not found" });

  await db.query("DELETE FROM inventory WHERE id = ?", [req.params.id]);

  res.json({ message: "Deleted" });
});


// ========================================================================
app.use((req, res) => {
  res.status(405).send("Method not allowed");
});


// ========================================================================
// START SERVER
// ========================================================================
const PORT = process.env.APP_PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
