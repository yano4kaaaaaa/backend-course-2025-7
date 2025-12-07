#!/usr/bin/env node

const express = require("express");
const { Command } = require("commander");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

const program = new Command();

program
  .requiredOption("-h, --host <host>", "Server host address")
  .requiredOption("-p, --port <port>", "Server port", parseInt)
  .requiredOption("-c, --cache <dir>", "Cache directory")
  .parse(process.argv);

const { host, port, cache } = program.opts();

if (!fs.existsSync(cache)) {
  fs.mkdirSync(cache, { recursive: true });
}

const DB_FILE = path.join(cache, "inventory.json");
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]", "utf8");

function loadDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer config
const upload = multer({
  dest: path.join(cache, "photos")
});

if (!fs.existsSync(path.join(cache, "photos")))
  fs.mkdirSync(path.join(cache, "photos"), { recursive: true });

// Swagger setup
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Inventory Service API",
      version: "1.0.0",
      description: "Web API for inventory management system"
    }
  },
  apis: ["./index.js"]
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));


// ========================================================
// POST /register
// ========================================================
/**
 * @openapi
 * /register:
 *   post:
 *     summary: Register a new inventory item
 *     description: Creates new item with name, description and optional photo.
 *     tags:
 *       - Inventory
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *                 description: Name of item
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Successfully created
 *       400:
 *         description: Missing inventory_name
 */
app.post("/register", upload.single("photo"), (req, res) => {
  const { inventory_name, description } = req.body;

  if (!inventory_name || inventory_name.trim() === "") {
    return res.status(400).json({ error: "inventory_name is required" });
  }

  const db = loadDB();

  const newItem = {
    id: Date.now().toString(),
    inventory_name,
    description: description || "",
    photo: req.file ? req.file.filename : null
  };

  db.push(newItem);
  saveDB(db);

  res.status(201).json(newItem);
});


// ========================================================
// GET /inventory
// ========================================================
/**
 * @openapi
 * /inventory:
 *   get:
 *     summary: Get all inventory items
 *     tags:
 *       - Inventory
 *     responses:
 *       200:
 *         description: Inventory list returned
 */
app.get("/inventory", (req, res) => {
  const db = loadDB();
  res.json(db);
});


// ========================================================
// GET /inventory/:id
// ========================================================
/**
 * @openapi
 * /inventory/{id}:
 *   get:
 *     summary: Get inventory item by ID
 *     tags:
 *       - Inventory
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Item found
 *       404:
 *         description: Not found
 */
app.get("/inventory/:id", (req, res) => {
  const db = loadDB();
  const item = db.find(x => x.id === req.params.id);

  if (!item) return res.status(404).json({ error: "Not found" });

  res.json(item);
});


// ========================================================
// PUT /inventory/:id
// ========================================================
/**
 * @openapi
 * /inventory/{id}:
 *   put:
 *     summary: Update inventory item
 *     tags:
 *       - Inventory
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Not found
 */
app.put("/inventory/:id", (req, res) => {
  const db = loadDB();
  const idx = db.findIndex(x => x.id === req.params.id);

  if (idx === -1) {
    return res.status(404).json({ error: "Not found" });
  }

  const { inventory_name, description } = req.body;

  // nothing sent in body
  if (!inventory_name && !description) {
    return res.status(400).json({ error: "No fields provided for update" });
  }

  if (inventory_name !== undefined) {
    db[idx].inventory_name = inventory_name;
  }

  if (description !== undefined) {
    db[idx].description = description;
  }

  saveDB(db);

  res.json(db[idx]);
});



// ========================================================
// GET /inventory/:id/photo
// ========================================================
/**
 * @openapi
 * /inventory/{id}/photo:
 *   get:
 *     summary: Get photo of an item
 *     tags:
 *       - Inventory
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Photo returned
 *       404:
 *         description: Not found
 */
app.get("/inventory/:id/photo", (req, res) => {
  const db = loadDB();
  const item = db.find(x => x.id === req.params.id);

  if (!item || !item.photo) return res.status(404).send("Not found");

  const photoPath = path.join(cache, "photos", item.photo);

  if (!fs.existsSync(photoPath))
    return res.status(404).send("Photo not found");

  res.setHeader("Content-Type", "image/jpeg");
  fs.createReadStream(photoPath).pipe(res);
});


// ========================================================
// PUT /inventory/:id/photo
// ========================================================
/**
 * @openapi
 * /inventory/{id}/photo:
 *   put:
 *     summary: Update photo of an item
 *     tags:
 *       - Inventory
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Photo updated
 *       400:
 *         description: Missing file
 *       404:
 *         description: Item not found
 */
app.put("/inventory/:id/photo", upload.single("photo"), (req, res) => {
  const db = loadDB();
  const idx = db.findIndex(x => x.id === req.params.id);

  if (idx === -1) return res.status(404).json({ error: "Not found" });
  if (!req.file) return res.status(400).json({ error: "Photo missing" });

  db[idx].photo = req.file.filename;
  saveDB(db);

  res.json({ message: "Photo updated" });
});


// ========================================================
// POST /search
// ========================================================
/**
 * @openapi
 * /search:
 *   post:
 *     summary: Search for an item by ID
 *     description: Search form using x-www-form-urlencoded
 *     tags:
 *       - Inventory
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               includePhoto:
 *                 type: string
 *     responses:
 *       200:
 *         description: Item found
 *       404:
 *         description: Not found
 */
app.post("/search", (req, res) => {
  const { id, includePhoto } = req.body;

  const db = loadDB();
  const item = db.find(x => x.id === id);

  if (!item) return res.status(404).send("Not found");

  if (includePhoto) {
    item.description += `\nPhoto: /inventory/${id}/photo`;
  }

  res.json(item);
});


// ========================================================
// DELETE /inventory/:id
// ========================================================
/**
 * @openapi
 * /inventory/{id}:
 *   delete:
 *     summary: Delete an inventory item
 *     tags:
 *       - Inventory
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not found
 */
app.delete("/inventory/:id", (req, res) => {
  const db = loadDB();
  const id = req.params.id;

  const idx = db.findIndex(x => String(x.id) === String(id));

  if (idx === -1) {
    return res.status(404).json({ error: `Item with id ${id} not found` });
  }

  db.splice(idx, 1);
  saveDB(db);

  res.json({ message: `Item with id ${id} deleted` });
});


// ========================================================
app.use((req, res) => {
  res.status(405).send("Method not allowed");
});


// ========================================================
app.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
});