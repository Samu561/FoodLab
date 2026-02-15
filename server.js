const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { DatabaseSync } = require("node:sqlite");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_PATH = path.join(ROOT, "foodlab.db");

const SUBSCRIPTION_FEES = {
  DAILY: 5000,
  WEEKLY: 12000,
  MONTHLY: 30000
};
const APP_VERSION = "foodlab-2026-02-15-c";

const db = new DatabaseSync(DB_PATH);
const sessions = new Map();

initDb();
seedIfEmpty();

const staticFiles = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    const file = staticFiles[url.pathname];
    if (!file) {
      respondJson(res, 404, { error: "Ruta no encontrada" });
      return;
    }

    serveStatic(res, path.join(ROOT, file));
  } catch (error) {
    respondJson(res, 500, { error: "Error interno", detail: String(error.message || error) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`FoodLab corriendo en http://localhost:${PORT}`);
});

function initDb() {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price INTEGER NOT NULL,
      calories INTEGER NOT NULL DEFAULT 0,
      ingredients TEXT,
      photo TEXT,
      sold_out INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cravings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      dish_id INTEGER,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price INTEGER NOT NULL,
      calories INTEGER NOT NULL DEFAULT 0,
      ingredients TEXT,
      photo TEXT,
      sold_out INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      restaurant_id INTEGER,
      carnet_code TEXT,
      promo_percent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      reset_code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER NOT NULL,
      dish_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, dish_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      pickup_time TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      subtotal INTEGER NOT NULL DEFAULT 0,
      discount_amount INTEGER NOT NULL DEFAULT 0,
      subscription_frequency TEXT,
      subscription_fee INTEGER NOT NULL DEFAULT 0,
      total_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      status_label TEXT NOT NULL,
      queue_type TEXT NOT NULL DEFAULT 'exclusive',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      dish_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price_snapshot INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (dish_id) REFERENCES dishes(id)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      frequency TEXT NOT NULL,
      plan_fee INTEGER NOT NULL DEFAULT 0,
      pickup_time TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subscription_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      dish_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
      FOREIGN KEY (dish_id) REFERENCES dishes(id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dish_id INTEGER NOT NULL,
      user_id INTEGER,
      author TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  addColumnIfMissing("dishes", "calories", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("orders", "user_id", "INTEGER");
  addColumnIfMissing("orders", "subtotal", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("orders", "discount_amount", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("orders", "subscription_frequency", "TEXT");
  addColumnIfMissing("orders", "subscription_fee", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("orders", "total_amount", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("subscriptions", "user_id", "INTEGER");
  addColumnIfMissing("subscriptions", "plan_fee", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("reviews", "user_id", "INTEGER");
  addColumnIfMissing("cravings", "dish_id", "INTEGER");

  // Repara datos antiguos para que el precio de suscripción no quede en 0.
  db.exec(`
    UPDATE subscriptions
    SET plan_fee = CASE UPPER(frequency)
      WHEN 'DAILY' THEN 5000
      WHEN 'WEEKLY' THEN 12000
      WHEN 'MONTHLY' THEN 30000
      WHEN 'DIARIA' THEN 5000
      WHEN 'SEMANAL' THEN 12000
      WHEN 'MENSUAL' THEN 30000
      ELSE 0
    END
    WHERE plan_fee = 0;
  `);

  db.exec(`
    UPDATE orders
    SET subscription_fee = CASE UPPER(subscription_frequency)
      WHEN 'DAILY' THEN 5000
      WHEN 'WEEKLY' THEN 12000
      WHEN 'MONTHLY' THEN 30000
      WHEN 'DIARIA' THEN 5000
      WHEN 'SEMANAL' THEN 12000
      WHEN 'MENSUAL' THEN 30000
      ELSE 0
    END
    WHERE subscription_fee = 0 AND subscription_frequency IS NOT NULL;
  `);

  // Backfill: enlaza antojos antiguos con un plato equivalente para habilitar carrito/favoritos.
  const cravingsToLink = db.prepare(`
    SELECT id, restaurant_id AS restaurantId, title, description, price, calories, ingredients, photo, sold_out AS soldOut
    FROM cravings
    WHERE dish_id IS NULL
  `).all();
  const createDishForCraving = db.prepare(`
    INSERT INTO dishes (restaurant_id, title, description, price, calories, ingredients, photo, sold_out)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const linkCravingDish = db.prepare("UPDATE cravings SET dish_id = ? WHERE id = ?");
  for (const craving of cravingsToLink) {
    const dish = createDishForCraving.run(
      craving.restaurantId,
      craving.title,
      craving.description,
      craving.price,
      craving.calories || 0,
      craving.ingredients || "",
      craving.photo || "",
      craving.soldOut || 0
    );
    linkCravingDish.run(Number(dish.lastInsertRowid), craving.id);
  }
}

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 12);
}

function verifyLegacyScrypt(plain, stored) {
  if (!stored.startsWith("scrypt$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 3) return false;

  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = crypto.scryptSync(plain, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== "string") return false;
  if (stored.startsWith("$2")) return bcrypt.compareSync(plain, stored);
  if (stored.startsWith("scrypt$")) return verifyLegacyScrypt(plain, stored);
  return plain === stored;
}

function maybeUpgradePassword(userId, stored, plain) {
  if (stored.startsWith("$2")) return;
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword(plain), userId);
}

function getSubscriptionFee(frequency) {
  const key = String(frequency || "").trim().toUpperCase();
  if (key === "DIARIA") return SUBSCRIPTION_FEES.DAILY;
  if (key === "SEMANAL") return SUBSCRIPTION_FEES.WEEKLY;
  if (key === "MENSUAL") return SUBSCRIPTION_FEES.MONTHLY;
  return SUBSCRIPTION_FEES[key] || 0;
}

function seedIfEmpty() {
  const countRestaurants = db.prepare("SELECT COUNT(*) AS c FROM restaurants").get().c;
  if (countRestaurants === 0) {
    const createRestaurant = db.prepare("INSERT INTO restaurants (name, location) VALUES (?, ?)");
    createRestaurant.run("La Plaza EAFIT", "Bloque 18");
    createRestaurant.run("Bowl Express", "Bloque 20");

    const createDish = db.prepare("INSERT INTO dishes (restaurant_id, title, description, price, calories, ingredients, photo, sold_out) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    createDish.run(1, "Menú del día: Pollo al horno", "Incluye arroz integral y ensalada", 15500, 640, "Pollo, arroz integral, ensalada", "", 0);
    createDish.run(2, "Bowl veggie rápido", "Garbanzos, quinoa y verduras", 13900, 520, "Garbanzos, quinoa, verduras", "", 0);

    db.prepare("INSERT INTO cravings (restaurant_id, title, description, price, calories, ingredients, photo, sold_out) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      1,
      "Empanadas de queso",
      "Pa'comer algo rápido entre clases",
      6000,
      320,
      "Masa de maíz, queso",
      "",
      0
    );

    db.prepare("INSERT INTO reviews (dish_id, author, rating, comment) VALUES (?, ?, ?, ?)").run(1, "Juliana", 5, "Llegó rápido y estaba bien servido.");
  }

  const countUsers = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (countUsers === 0) {
    const createUser = db.prepare("INSERT INTO users (email, password, display_name, role, restaurant_id, carnet_code, promo_percent) VALUES (?, ?, ?, ?, ?, ?, ?)");
    createUser.run("admin@foodlab.eafit", hashPassword("admin123"), "Admin FoodLab", "admin", null, null, 0);
    createUser.run("plaza@foodlab.eafit", hashPassword("rest123"), "Operador La Plaza", "restaurant", 1, null, 0);
    createUser.run("juliana@eafit.edu.co", hashPassword("student123"), "Juliana", "student", null, "EAFIT-2026-001", 10);
  }
}

function serveStatic(res, filePath) {
  if (!fs.existsSync(filePath)) {
    respondJson(res, 404, { error: "Archivo no encontrado" });
    return;
  }

  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8"
  };

  res.writeHead(200, { "Content-Type": types[ext] || "text/plain; charset=utf-8" });
  fs.createReadStream(filePath).pipe(res);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function respondJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function toBool(value) {
  return value ? 1 : 0;
}

function extractToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function getSessionUser(req) {
  const token = extractToken(req);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;

  return db.prepare(`
    SELECT id, email, display_name AS displayName, role, restaurant_id AS restaurantId,
           carnet_code AS carnetCode, promo_percent AS promoPercent
    FROM users WHERE id = ?
  `).get(session.userId) || null;
}

function requireAuth(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    respondJson(res, 401, { error: "No autenticado" });
    return null;
  }
  return user;
}

function requireRole(res, user, allowedRoles) {
  if (!allowedRoles.includes(user.role)) {
    respondJson(res, 403, { error: "No autorizado para esta acción" });
    return false;
  }
  return true;
}

function parseId(pathName) {
  return Number(pathName.split("/").pop());
}

function buildSetClause(obj, fields) {
  const entries = Object.entries(obj).filter(([key, value]) => fields.includes(key) && value !== undefined);
  if (!entries.length) return null;
  return {
    assignments: entries.map(([key]) => `${key} = ?`).join(", "),
    values: entries.map(([, value]) => value)
  };
}

function fetchRestaurants() {
  return db.prepare("SELECT id, name, location, created_at AS createdAt FROM restaurants ORDER BY id DESC").all();
}

function fetchDishes(user) {
  let rows;
  if (user.role === "restaurant" && user.restaurantId) {
    rows = db.prepare(`
      SELECT d.id, d.restaurant_id AS restaurantId, d.title, d.description, d.price, d.calories,
             d.ingredients, d.photo, d.sold_out AS soldOut, d.created_at AS createdAt,
             r.name AS restaurantName, r.location AS restaurantLocation
      FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id
      WHERE d.restaurant_id = ?
      ORDER BY d.id DESC
    `).all(user.restaurantId);
  } else {
    rows = db.prepare(`
      SELECT d.id, d.restaurant_id AS restaurantId, d.title, d.description, d.price, d.calories,
             d.ingredients, d.photo, d.sold_out AS soldOut, d.created_at AS createdAt,
             r.name AS restaurantName, r.location AS restaurantLocation
      FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id
      ORDER BY d.id DESC
    `).all();
  }

  return rows.map((dish) => ({ ...dish, soldOut: Boolean(dish.soldOut) }));
}

function fetchCravings() {
  return db.prepare(`
    SELECT c.id, c.restaurant_id AS restaurantId, c.dish_id AS dishId, c.title, c.description, c.price, c.calories,
           c.ingredients, c.photo, c.sold_out AS soldOut, c.created_at AS createdAt,
           r.name AS restaurantName, r.location AS restaurantLocation
    FROM cravings c JOIN restaurants r ON r.id = c.restaurant_id
    ORDER BY c.id DESC
  `).all().map((item) => ({ ...item, soldOut: Boolean(item.soldOut) }));
}

function fetchReviews(user) {
  if (user.role === "restaurant" && user.restaurantId) {
    return db.prepare(`
      SELECT rv.id, rv.dish_id AS dishId, rv.author, rv.rating, rv.comment, rv.created_at AS createdAt
      FROM reviews rv JOIN dishes d ON d.id = rv.dish_id
      WHERE d.restaurant_id = ?
      ORDER BY rv.id DESC
    `).all(user.restaurantId);
  }

  return db.prepare("SELECT id, dish_id AS dishId, author, rating, comment, created_at AS createdAt FROM reviews ORDER BY id DESC").all();
}

function fetchFavorites(userId) {
  return db.prepare("SELECT dish_id AS dishId FROM favorites WHERE user_id = ?").all(userId).map((row) => Number(row.dishId));
}

function fetchSubscriptions(user) {
  return db.prepare(`
    SELECT id, name, frequency, plan_fee AS planFee, pickup_time AS pickupTime, payment_method AS paymentMethod,
           active, created_at AS createdAt
    FROM subscriptions
    WHERE user_id = ?
    ORDER BY id DESC
  `).all(user.id).map((sub) => ({
    ...sub,
    planFee: Number(sub.planFee || getSubscriptionFee(sub.frequency)),
    active: Boolean(sub.active),
    items: db.prepare(`
      SELECT si.dish_id AS dishId, si.quantity, d.title, d.price
      FROM subscription_items si JOIN dishes d ON d.id = si.dish_id
      WHERE si.subscription_id = ?
    `).all(sub.id)
  }));
}

function fetchLatestOrder(user) {
  const order = db.prepare(`
    SELECT id, pickup_time AS pickupTime, payment_method AS paymentMethod, subtotal,
           discount_amount AS discountAmount, subscription_frequency AS subscriptionFrequency,
           subscription_fee AS subscriptionFee, total_amount AS totalAmount, status,
           status_label AS statusLabel, queue_type AS queueType, created_at AS createdAt
    FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1
  `).get(user.id);

  if (!order) return null;

  order.items = db.prepare(`
    SELECT oi.dish_id AS dishId, oi.quantity, oi.price_snapshot AS priceSnapshot, d.title
    FROM order_items oi JOIN dishes d ON d.id = oi.dish_id
    WHERE oi.order_id = ?
  `).all(order.id);

  return order;
}

function canManageDish(user, dishId) {
  if (user.role === "admin") return true;
  if (user.role !== "restaurant" || !user.restaurantId) return false;
  const row = db.prepare("SELECT restaurant_id AS restaurantId FROM dishes WHERE id = ?").get(Number(dishId));
  return row && Number(row.restaurantId) === Number(user.restaurantId);
}

function canManageCraving(user, cravingId) {
  if (user.role === "admin") return true;
  if (user.role !== "restaurant" || !user.restaurantId) return false;
  const row = db.prepare("SELECT restaurant_id AS restaurantId FROM cravings WHERE id = ?").get(Number(cravingId));
  return row && Number(row.restaurantId) === Number(user.restaurantId);
}

async function handleApi(req, res, url) {
  const method = req.method || "GET";
  const pathName = url.pathname;

  if (method === "GET" && pathName === "/api/health") {
    respondJson(res, 200, { ok: true, version: APP_VERSION });
    return;
  }

  if (method === "POST" && pathName === "/api/auth/login") {
    const body = await parseBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    const userRow = db.prepare(`
      SELECT id, email, password, display_name AS displayName, role, restaurant_id AS restaurantId,
             carnet_code AS carnetCode, promo_percent AS promoPercent
      FROM users WHERE email = ?
    `).get(email);

    if (!userRow || !verifyPassword(password, userRow.password)) {
      respondJson(res, 401, { error: "Credenciales inválidas" });
      return;
    }

    maybeUpgradePassword(userRow.id, userRow.password, password);

    const token = crypto.randomUUID();
    sessions.set(token, { userId: userRow.id, createdAt: Date.now() });
    delete userRow.password;

    respondJson(res, 200, { token, user: userRow });
    return;
  }

  if (method === "POST" && pathName === "/api/auth/request-reset") {
    const body = await parseBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);

    if (!user) {
      respondJson(res, 200, { ok: true, message: "Si el correo existe, enviamos instrucciones." });
      return;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 15 * 60 * 1000;

    db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0").run(user.id);
    db.prepare("INSERT INTO password_reset_tokens (user_id, reset_code, expires_at, used) VALUES (?, ?, ?, 0)").run(user.id, code, expiresAt);

    respondJson(res, 200, {
      ok: true,
      message: "Código generado. En producción se enviaría por correo.",
      resetCode: code,
      expiresAt
    });
    return;
  }

  if (method === "POST" && pathName === "/api/auth/reset-password") {
    const body = await parseBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const resetCode = String(body.resetCode || "").trim();
    const newPassword = String(body.newPassword || "");

    if (newPassword.length < 6) {
      respondJson(res, 400, { error: "La nueva contraseña debe tener mínimo 6 caracteres" });
      return;
    }

    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (!user) {
      respondJson(res, 400, { error: "Datos de recuperación inválidos" });
      return;
    }

    const token = db.prepare(`
      SELECT id, expires_at AS expiresAt, used
      FROM password_reset_tokens
      WHERE user_id = ? AND reset_code = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(user.id, resetCode);

    if (!token || Number(token.used) === 1 || Date.now() > Number(token.expiresAt)) {
      respondJson(res, 400, { error: "Código inválido o expirado" });
      return;
    }

    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword(newPassword), user.id);
    db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE id = ?").run(token.id);
    respondJson(res, 200, { ok: true, message: "Contraseña actualizada" });
    return;
  }

  if (method === "POST" && pathName === "/api/auth/logout") {
    const token = extractToken(req);
    if (token) sessions.delete(token);
    respondJson(res, 200, { ok: true });
    return;
  }

  const user = requireAuth(req, res);
  if (!user) return;

  if (method === "GET" && pathName === "/api/bootstrap") {
    respondJson(res, 200, {
      user,
      restaurants: fetchRestaurants(),
      dishes: fetchDishes(user),
      cravings: fetchCravings(),
      favorites: fetchFavorites(user.id),
      reviews: fetchReviews(user),
      subscriptions: fetchSubscriptions(user),
      latestOrder: fetchLatestOrder(user)
    });
    return;
  }

  if (method === "GET" && pathName === "/api/auth/me") {
    respondJson(res, 200, user);
    return;
  }

  if (method === "GET" && pathName === "/api/restaurants") {
    respondJson(res, 200, fetchRestaurants());
    return;
  }

  if (method === "POST" && pathName === "/api/restaurants") {
    if (!requireRole(res, user, ["admin"])) return;
    const body = await parseBody(req);
    if (!body.name || !body.location) {
      respondJson(res, 400, { error: "name y location son obligatorios" });
      return;
    }

    const result = db.prepare("INSERT INTO restaurants (name, location) VALUES (?, ?)").run(String(body.name).trim(), String(body.location).trim());
    respondJson(res, 201, { id: Number(result.lastInsertRowid) });
    return;
  }

  if (method === "PATCH" && /^\/api\/restaurants\/\d+$/.test(pathName)) {
    if (!requireRole(res, user, ["admin"])) return;
    const id = parseId(pathName);
    const body = await parseBody(req);

    const update = buildSetClause({
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      location: body.location !== undefined ? String(body.location).trim() : undefined
    }, ["name", "location"]);

    if (!update) {
      respondJson(res, 400, { error: "No hay campos para actualizar" });
      return;
    }

    db.prepare(`UPDATE restaurants SET ${update.assignments} WHERE id = ?`).run(...update.values, id);
    respondJson(res, 200, { ok: true });
    return;
  }

  if (method === "DELETE" && /^\/api\/restaurants\/\d+$/.test(pathName)) {
    if (!requireRole(res, user, ["admin"])) return;
    const id = parseId(pathName);
    db.prepare("DELETE FROM restaurants WHERE id = ?").run(id);
    respondJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && pathName === "/api/dishes") {
    respondJson(res, 200, fetchDishes(user));
    return;
  }

  if (method === "POST" && pathName === "/api/dishes") {
    if (!requireRole(res, user, ["admin", "restaurant"])) return;
    const body = await parseBody(req);

    if (!body.restaurantId || !body.title || !body.description || Number.isNaN(Number(body.price))) {
      respondJson(res, 400, { error: "restaurantId, title, description y price son obligatorios" });
      return;
    }

    const restaurantId = Number(body.restaurantId);
    if (user.role === "restaurant" && Number(user.restaurantId) !== restaurantId) {
      respondJson(res, 403, { error: "Solo puedes crear platos para tu restaurante" });
      return;
    }

    const result = db.prepare(
      "INSERT INTO dishes (restaurant_id, title, description, price, calories, ingredients, photo, sold_out) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      restaurantId,
      String(body.title).trim(),
      String(body.description).trim(),
      Number(body.price),
      Number(body.calories || 0),
      String(body.ingredients || "").trim(),
      String(body.photo || "").trim(),
      toBool(Boolean(body.soldOut))
    );

    respondJson(res, 201, { id: Number(result.lastInsertRowid) });
    return;
  }

  if (method === "PATCH" && /^\/api\/dishes\/\d+$/.test(pathName)) {
    if (!requireRole(res, user, ["admin", "restaurant"])) return;
    const id = parseId(pathName);
    if (!canManageDish(user, id)) {
      respondJson(res, 403, { error: "No puedes editar este plato" });
      return;
    }

    const body = await parseBody(req);
    const update = buildSetClause({
      title: body.title !== undefined ? String(body.title).trim() : undefined,
      description: body.description !== undefined ? String(body.description).trim() : undefined,
      price: body.price !== undefined ? Number(body.price) : undefined,
      calories: body.calories !== undefined ? Number(body.calories) : undefined,
      ingredients: body.ingredients !== undefined ? String(body.ingredients).trim() : undefined,
      photo: body.photo !== undefined ? String(body.photo).trim() : undefined,
      sold_out: body.soldOut !== undefined ? toBool(Boolean(body.soldOut)) : undefined
    }, ["title", "description", "price", "calories", "ingredients", "photo", "sold_out"]);

    if (!update) {
      respondJson(res, 400, { error: "No hay campos para actualizar" });
      return;
    }

    db.prepare(`UPDATE dishes SET ${update.assignments} WHERE id = ?`).run(...update.values, id);
    respondJson(res, 200, { ok: true });
    return;
  }

  if (method === "DELETE" && /^\/api\/dishes\/\d+$/.test(pathName)) {
    if (!requireRole(res, user, ["admin", "restaurant"])) return;
    const id = parseId(pathName);
    if (!canManageDish(user, id)) {
      respondJson(res, 403, { error: "No puedes eliminar este plato" });
      return;
    }

    db.prepare("DELETE FROM dishes WHERE id = ?").run(id);
    respondJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && pathName === "/api/cravings") {
    respondJson(res, 200, fetchCravings());
    return;
  }

  if (method === "POST" && pathName === "/api/cravings") {
    if (!requireRole(res, user, ["admin", "restaurant"])) return;
    const body = await parseBody(req);

    if (!body.restaurantId || !body.title || !body.description || Number.isNaN(Number(body.price))) {
      respondJson(res, 400, { error: "restaurantId, title, description y price son obligatorios" });
      return;
    }

    const restaurantId = Number(body.restaurantId);
    if (user.role === "restaurant" && Number(user.restaurantId) !== restaurantId) {
      respondJson(res, 403, { error: "Solo puedes crear antojos para tu restaurante" });
      return;
    }

    const dishResult = db.prepare(
      "INSERT INTO dishes (restaurant_id, title, description, price, calories, ingredients, photo, sold_out) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      restaurantId,
      String(body.title).trim(),
      String(body.description).trim(),
      Number(body.price),
      Number(body.calories || 0),
      String(body.ingredients || "").trim(),
      String(body.photo || "").trim(),
      toBool(Boolean(body.soldOut))
    );
    const result = db.prepare(
      "INSERT INTO cravings (restaurant_id, dish_id, title, description, price, calories, ingredients, photo, sold_out) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      restaurantId,
      Number(dishResult.lastInsertRowid),
      String(body.title).trim(),
      String(body.description).trim(),
      Number(body.price),
      Number(body.calories || 0),
      String(body.ingredients || "").trim(),
      String(body.photo || "").trim(),
      toBool(Boolean(body.soldOut))
    );

    respondJson(res, 201, { id: Number(result.lastInsertRowid) });
    return;
  }

  if (method === "PATCH" && /^\/api\/cravings\/\d+$/.test(pathName)) {
    if (!requireRole(res, user, ["admin", "restaurant"])) return;
    const id = parseId(pathName);
    if (!canManageCraving(user, id)) {
      respondJson(res, 403, { error: "No puedes editar este antojo" });
      return;
    }

    const body = await parseBody(req);
    const update = buildSetClause({
      title: body.title !== undefined ? String(body.title).trim() : undefined,
      description: body.description !== undefined ? String(body.description).trim() : undefined,
      price: body.price !== undefined ? Number(body.price) : undefined,
      calories: body.calories !== undefined ? Number(body.calories) : undefined,
      ingredients: body.ingredients !== undefined ? String(body.ingredients).trim() : undefined,
      photo: body.photo !== undefined ? String(body.photo).trim() : undefined,
      sold_out: body.soldOut !== undefined ? toBool(Boolean(body.soldOut)) : undefined
    }, ["title", "description", "price", "calories", "ingredients", "photo", "sold_out"]);

    if (!update) {
      respondJson(res, 400, { error: "No hay campos para actualizar" });
      return;
    }

    db.prepare(`UPDATE cravings SET ${update.assignments} WHERE id = ?`).run(...update.values, id);
    const craving = db.prepare("SELECT dish_id AS dishId FROM cravings WHERE id = ?").get(id);
    if (craving && craving.dishId) {
      const dishUpdate = buildSetClause({
        title: body.title !== undefined ? String(body.title).trim() : undefined,
        description: body.description !== undefined ? String(body.description).trim() : undefined,
        price: body.price !== undefined ? Number(body.price) : undefined,
        calories: body.calories !== undefined ? Number(body.calories) : undefined,
        ingredients: body.ingredients !== undefined ? String(body.ingredients).trim() : undefined,
        photo: body.photo !== undefined ? String(body.photo).trim() : undefined,
        sold_out: body.soldOut !== undefined ? toBool(Boolean(body.soldOut)) : undefined
      }, ["title", "description", "price", "calories", "ingredients", "photo", "sold_out"]);
      if (dishUpdate) {
        db.prepare(`UPDATE dishes SET ${dishUpdate.assignments} WHERE id = ?`).run(...dishUpdate.values, craving.dishId);
      }
    }
    respondJson(res, 200, { ok: true });
    return;
  }

  if (method === "DELETE" && /^\/api\/cravings\/\d+$/.test(pathName)) {
    if (!requireRole(res, user, ["admin", "restaurant"])) return;
    const id = parseId(pathName);
    if (!canManageCraving(user, id)) {
      respondJson(res, 403, { error: "No puedes eliminar este antojo" });
      return;
    }

    const craving = db.prepare("SELECT dish_id AS dishId FROM cravings WHERE id = ?").get(id);
    db.prepare("DELETE FROM cravings WHERE id = ?").run(id);
    if (craving && craving.dishId) {
      db.prepare("DELETE FROM dishes WHERE id = ?").run(craving.dishId);
    }
    respondJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && pathName === "/api/favorites") {
    respondJson(res, 200, fetchFavorites(user.id));
    return;
  }

  if (method === "POST" && pathName === "/api/favorites") {
    const body = await parseBody(req);
    const dishId = Number(body.dishId);
    if (!dishId) {
      respondJson(res, 400, { error: "dishId es obligatorio" });
      return;
    }

    db.prepare("INSERT OR IGNORE INTO favorites (user_id, dish_id) VALUES (?, ?)").run(user.id, dishId);
    respondJson(res, 201, { ok: true });
    return;
  }

  if (method === "DELETE" && /^\/api\/favorites\/\d+$/.test(pathName)) {
    const dishId = parseId(pathName);
    db.prepare("DELETE FROM favorites WHERE user_id = ? AND dish_id = ?").run(user.id, dishId);
    respondJson(res, 200, { ok: true });
    return;
  }

  if (method === "POST" && pathName === "/api/orders") {
    const body = await parseBody(req);
    const items = Array.isArray(body.items) ? body.items : [];

    if (!body.pickupTime || !body.paymentMethod || !items.length) {
      respondJson(res, 400, { error: "pickupTime, paymentMethod e items son obligatorios" });
      return;
    }

    let subtotal = 0;
    const validItems = [];

    for (const item of items) {
      const dish = db.prepare("SELECT id, price, sold_out AS soldOut FROM dishes WHERE id = ?").get(Number(item.dishId));
      if (!dish || Number(dish.soldOut) === 1) continue;
      const quantity = Math.max(1, Number(item.quantity || 1));
      subtotal += Number(dish.price) * quantity;
      validItems.push({ dishId: Number(dish.id), quantity, price: Number(dish.price) });
    }

    if (!validItems.length) {
      respondJson(res, 400, { error: "No hay items válidos en el pedido" });
      return;
    }

    const promoPercent = Number(user.promoPercent || 0);
    const discountAmount = Math.round(subtotal * promoPercent / 100);

    const subscriptionEnabled = Boolean(body.subscription && body.subscription.enabled);
    const subscriptionFrequency = subscriptionEnabled ? String(body.subscription.frequency || "") : null;
    if (subscriptionEnabled && !SUBSCRIPTION_FEES[subscriptionFrequency]) {
      respondJson(res, 400, { error: "Frecuencia de suscripción inválida" });
      return;
    }
    const subscriptionFee = subscriptionEnabled ? getSubscriptionFee(subscriptionFrequency) : 0;

    const totalAmount = Math.max(0, subtotal - discountAmount + subscriptionFee);

    const orderResult = db.prepare(
      "INSERT INTO orders (user_id, pickup_time, payment_method, subtotal, discount_amount, subscription_frequency, subscription_fee, total_amount, status, status_label, queue_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      user.id,
      String(body.pickupTime),
      String(body.paymentMethod),
      subtotal,
      discountAmount,
      subscriptionFrequency,
      subscriptionFee,
      totalAmount,
      "preparing",
      "En preparación",
      "exclusive"
    );

    const orderId = Number(orderResult.lastInsertRowid);
    const createOrderItem = db.prepare("INSERT INTO order_items (order_id, dish_id, quantity, price_snapshot) VALUES (?, ?, ?, ?)");
    for (const item of validItems) {
      createOrderItem.run(orderId, item.dishId, item.quantity, item.price);
    }

    respondJson(res, 201, {
      id: orderId,
      subtotal,
      discountAmount,
      subscriptionFee,
      totalAmount
    });
    return;
  }

  if (method === "PATCH" && /^\/api\/orders\/\d+\/status$/.test(pathName)) {
    if (!requireRole(res, user, ["admin", "restaurant"])) return;
    const orderId = Number(pathName.split("/")[3]);
    const body = await parseBody(req);

    if (!body.status || !body.statusLabel) {
      respondJson(res, 400, { error: "status y statusLabel son obligatorios" });
      return;
    }

    db.prepare("UPDATE orders SET status = ?, status_label = ? WHERE id = ?").run(String(body.status), String(body.statusLabel), orderId);
    respondJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && pathName === "/api/subscriptions") {
    respondJson(res, 200, fetchSubscriptions(user));
    return;
  }

  if (method === "POST" && pathName === "/api/subscriptions") {
    const body = await parseBody(req);
    const items = Array.isArray(body.items) ? body.items : [];

    if (!body.name || !body.frequency || !body.pickupTime || !body.paymentMethod || !items.length) {
      respondJson(res, 400, { error: "name, frequency, pickupTime, paymentMethod e items son obligatorios" });
      return;
    }

    const frequency = String(body.frequency);
    const planFee = getSubscriptionFee(frequency);
    if (!planFee) {
      respondJson(res, 400, { error: "Frecuencia inválida" });
      return;
    }

    const subResult = db.prepare(
      "INSERT INTO subscriptions (user_id, name, frequency, plan_fee, pickup_time, payment_method, active) VALUES (?, ?, ?, ?, ?, ?, 1)"
    ).run(
      user.id,
      String(body.name).trim(),
      frequency,
      planFee,
      String(body.pickupTime),
      String(body.paymentMethod)
    );

    const subId = Number(subResult.lastInsertRowid);
    const createSubItem = db.prepare("INSERT INTO subscription_items (subscription_id, dish_id, quantity) VALUES (?, ?, ?)");

    for (const item of items) {
      const dish = db.prepare("SELECT id FROM dishes WHERE id = ?").get(Number(item.dishId));
      if (!dish) continue;
      createSubItem.run(subId, Number(item.dishId), Math.max(1, Number(item.quantity || 1)));
    }

    respondJson(res, 201, { id: subId });
    return;
  }

  if (method === "DELETE" && /^\/api\/subscriptions\/\d+$/.test(pathName)) {
    const id = parseId(pathName);
    db.prepare("DELETE FROM subscriptions WHERE id = ? AND user_id = ?").run(id, user.id);
    respondJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && /^\/api\/dishes\/\d+\/reviews$/.test(pathName)) {
    const dishId = Number(pathName.split("/")[3]);
    const reviews = db.prepare("SELECT id, dish_id AS dishId, author, rating, comment, created_at AS createdAt FROM reviews WHERE dish_id = ? ORDER BY id DESC").all(dishId);
    respondJson(res, 200, reviews);
    return;
  }

  if (method === "POST" && /^\/api\/dishes\/\d+\/reviews$/.test(pathName)) {
    const dishId = Number(pathName.split("/")[3]);
    const body = await parseBody(req);
    const rating = Number(body.rating);
    const comment = String(body.comment || "").trim();

    if (!comment || Number.isNaN(rating) || rating < 1 || rating > 5) {
      respondJson(res, 400, { error: "rating (1-5) y comment son obligatorios" });
      return;
    }

    const result = db.prepare("INSERT INTO reviews (dish_id, user_id, author, rating, comment) VALUES (?, ?, ?, ?, ?)").run(
      dishId,
      user.id,
      user.displayName,
      rating,
      comment
    );

    respondJson(res, 201, { id: Number(result.lastInsertRowid) });
    return;
  }

  respondJson(res, 404, { error: "Ruta API no encontrada" });
}
