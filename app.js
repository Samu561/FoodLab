const SUBSCRIPTION_FEES = {
  DAILY: 5000,
  WEEKLY: 12000,
  MONTHLY: 30000
};

const state = {
  token: localStorage.getItem("foodlab_token") || "",
  user: null,
  restaurants: [],
  dishes: [],
  cravings: [],
  favorites: [],
  reviews: [],
  subscriptions: [],
  latestOrder: null,
  cart: []
};

const tabStudent = document.getElementById("tabStudent");
const tabAdmin = document.getElementById("tabAdmin");
const tabDocs = document.getElementById("tabDocs");

const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const requestResetForm = document.getElementById("requestResetForm");
const confirmResetForm = document.getElementById("confirmResetForm");
const resetEmail = document.getElementById("resetEmail");
const confirmEmail = document.getElementById("confirmEmail");
const resetCode = document.getElementById("resetCode");
const newPassword = document.getElementById("newPassword");
const resetFeedback = document.getElementById("resetFeedback");
const authInfo = document.getElementById("authInfo");
const logoutBtn = document.getElementById("logoutBtn");

const studentView = document.getElementById("studentView");
const adminView = document.getElementById("adminView");
const docsView = document.getElementById("docsView");

const restaurantFilter = document.getElementById("restaurantFilter");
const menuList = document.getElementById("menuList");
const cartList = document.getElementById("cartList");
const cartSubtotal = document.getElementById("cartSubtotal");
const cartDiscount = document.getElementById("cartDiscount");
const cartSubscriptionFee = document.getElementById("cartSubscriptionFee");
const cartTotal = document.getElementById("cartTotal");
const promoBadge = document.getElementById("promoBadge");
const paymentMethod = document.getElementById("paymentMethod");
const pickupTime = document.getElementById("pickupTime");
const betweenClassesMode = document.getElementById("betweenClassesMode");
const subscriptionFields = document.getElementById("subscriptionFields");
const subscriptionName = document.getElementById("subscriptionName");
const subscriptionFrequency = document.getElementById("subscriptionFrequency");
const placeOrderBtn = document.getElementById("placeOrderBtn");
const favoritesList = document.getElementById("favoritesList");
const cravingsList = document.getElementById("cravingsList");
const orderStatus = document.getElementById("orderStatus");
const subscriptionsList = document.getElementById("subscriptionsList");

const restaurantForm = document.getElementById("restaurantForm");
const restaurantName = document.getElementById("restaurantName");
const restaurantLocation = document.getElementById("restaurantLocation");
const restaurantsAdminList = document.getElementById("restaurantsAdminList");

const menuForm = document.getElementById("menuForm");
const menuRestaurant = document.getElementById("menuRestaurant");
const dishTitle = document.getElementById("dishTitle");
const dishDescription = document.getElementById("dishDescription");
const dishPrice = document.getElementById("dishPrice");
const dishCalories = document.getElementById("dishCalories");
const dishIngredients = document.getElementById("dishIngredients");
const dishPhoto = document.getElementById("dishPhoto");
const dishSoldOut = document.getElementById("dishSoldOut");
const adminMenuList = document.getElementById("adminMenuList");

const cravingForm = document.getElementById("cravingForm");
const cravingRestaurant = document.getElementById("cravingRestaurant");
const cravingTitle = document.getElementById("cravingTitle");
const cravingDescription = document.getElementById("cravingDescription");
const cravingPrice = document.getElementById("cravingPrice");
const cravingCalories = document.getElementById("cravingCalories");
const cravingIngredients = document.getElementById("cravingIngredients");
const cravingPhoto = document.getElementById("cravingPhoto");
const cravingSoldOut = document.getElementById("cravingSoldOut");
const cravingAdminList = document.getElementById("cravingAdminList");

const docsContent = document.getElementById("docsContent");

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let message = "Error en API";
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {}

    if (response.status === 401) {
      clearSession();
      showLogin();
    }

    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

function clearSession() {
  state.token = "";
  state.user = null;
  localStorage.removeItem("foodlab_token");
}

function showLogin() {
  loginView.classList.remove("hidden");
  loginView.classList.add("active");
  appView.classList.add("hidden");
  authInfo.textContent = "";
  logoutBtn.classList.add("hidden");
}

function canAccessAdmin() {
  return state.user && ["admin", "restaurant"].includes(state.user.role);
}

function showApp() {
  loginView.classList.add("hidden");
  loginView.classList.remove("active");
  appView.classList.remove("hidden");

  const roleLabel = state.user?.role || "sin rol";
  const carnet = state.user?.promoPercent ? ` · Carnet ${state.user.carnetCode} (${state.user.promoPercent}% off)` : "";
  authInfo.textContent = `${state.user.displayName} (${roleLabel})${carnet}`;
  logoutBtn.classList.remove("hidden");

  const canAdmin = canAccessAdmin();
  tabAdmin.disabled = !canAdmin;
  tabAdmin.classList.toggle("disabled", !canAdmin);

  const isAdmin = state.user?.role === "admin";
  restaurantForm.classList.toggle("hidden", !isAdmin);

  if (state.user?.role === "restaurant") {
    // Fijar restaurante para el operador.
    const ownRestaurantId = String(state.user.restaurantId || "");
    if (ownRestaurantId) {
      menuRestaurant.value = ownRestaurantId;
      cravingRestaurant.value = ownRestaurantId;
    }
  }
}

function setView(view) {
  tabStudent.classList.toggle("active", view === "student");
  tabAdmin.classList.toggle("active", view === "admin");
  tabDocs.classList.toggle("active", view === "docs");
  studentView.classList.toggle("active", view === "student");
  adminView.classList.toggle("active", view === "admin");
  docsView.classList.toggle("active", view === "docs");
}

function formatCOP(value) {
  return new Intl.NumberFormat("es-CO").format(Number(value || 0));
}

function getDish(id) {
  return state.dishes.find((item) => Number(item.id) === Number(id));
}

function getRestaurant(id) {
  return state.restaurants.find((item) => Number(item.id) === Number(id));
}

function isFavorite(dishId) {
  return state.favorites.includes(Number(dishId));
}

function subscriptionFeeForSelection() {
  if (!betweenClassesMode.checked) return 0;
  return SUBSCRIPTION_FEES[subscriptionFrequency.value] || 0;
}

function computeTotals() {
  const subtotal = state.cart.reduce((acc, item) => {
    const dish = getDish(item.dishId);
    return acc + (dish ? Number(dish.price) * Number(item.quantity) : 0);
  }, 0);

  const promo = Number(state.user?.promoPercent || 0);
  const discount = Math.round(subtotal * promo / 100);
  const subscriptionFee = subscriptionFeeForSelection();

  return {
    subtotal,
    discount,
    subscriptionFee,
    total: Math.max(0, subtotal - discount + subscriptionFee),
    promo
  };
}

function reviewSummaryByDish(dishId) {
  const list = state.reviews.filter((item) => Number(item.dishId) === Number(dishId));
  if (!list.length) return { count: 0, avg: 0, latest: [] };
  const avg = list.reduce((acc, item) => acc + Number(item.rating), 0) / list.length;
  return { count: list.length, avg: avg.toFixed(1), latest: list.slice(0, 2) };
}

function renderRestaurantSelectors() {
  const options = state.restaurants.map((item) => `<option value="${item.id}">${item.name} (${item.location})</option>`).join("");
  menuRestaurant.innerHTML = options;
  cravingRestaurant.innerHTML = options;

  const filterCurrent = restaurantFilter.value || "all";
  restaurantFilter.innerHTML = ['<option value="all">Todos</option>']
    .concat(state.restaurants.map((item) => `<option value="${item.id}">${item.name}</option>`))
    .join("");
  if ([...restaurantFilter.options].some((opt) => opt.value === filterCurrent)) {
    restaurantFilter.value = filterCurrent;
  }

  if (state.user?.role === "restaurant" && state.user.restaurantId) {
    menuRestaurant.value = String(state.user.restaurantId);
    cravingRestaurant.value = String(state.user.restaurantId);
    menuRestaurant.disabled = true;
    cravingRestaurant.disabled = true;
  } else {
    menuRestaurant.disabled = false;
    cravingRestaurant.disabled = false;
  }
}

function renderMenus() {
  const filter = restaurantFilter.value || "all";
  const visible = state.dishes.filter((dish) => filter === "all" || String(dish.restaurantId) === filter);

  if (!visible.length) {
    menuList.innerHTML = "<p class='meta'>No hay platos disponibles con este filtro.</p>";
    return;
  }

  menuList.innerHTML = visible.map((dish) => {
    const restaurant = getRestaurant(dish.restaurantId);
    const summary = reviewSummaryByDish(dish.id);

    return `
      <article class="menu-item">
        <h4>${dish.title}</h4>
        <p class="meta">${restaurant ? restaurant.name : "Sin restaurante"} · ${restaurant ? restaurant.location : ""}</p>
        <p class="meta">${dish.description}</p>
        <p class="meta">Ingredientes: ${dish.ingredients || "No especificados"}</p>
        <p class="meta">Calorías: ${Number(dish.calories || 0)} kcal</p>
        <p class="price">$${formatCOP(dish.price)}</p>
        <p class="meta">Reseñas: ${summary.count ? `${summary.avg}/5 (${summary.count})` : "Aún sin reseñas"}</p>
        <span class="badge ${dish.soldOut ? "out" : "ok"}">${dish.soldOut ? "Agotado" : "Disponible"}</span>
        <div class="action-row">
          <button class="secondary add-cart" data-id="${dish.id}" ${dish.soldOut ? "disabled" : ""}>${dish.soldOut ? "No disponible" : "Agregar al carrito"}</button>
          <button class="secondary toggle-favorite ${isFavorite(dish.id) ? "fav-active" : ""}" data-id="${dish.id}">${isFavorite(dish.id) ? "Quitar favorito" : "Guardar favorito"}</button>
        </div>

        <div class="review-list">${summary.latest.map((rv) => `<p class="meta">${rv.author} (${rv.rating}/5): ${rv.comment}</p>`).join("")}</div>

        <form class="review-form" data-dish-id="${dish.id}">
          <label class="field">
            <span>Calificación</span>
            <select name="rating" required>
              <option value="5">5</option>
              <option value="4">4</option>
              <option value="3">3</option>
              <option value="2">2</option>
              <option value="1">1</option>
            </select>
          </label>
          <label class="field">
            <span>Comentario</span>
            <input type="text" name="comment" required placeholder="¿Cómo estuvo el plato?">
          </label>
          <button class="secondary" type="submit">Publicar reseña</button>
        </form>
      </article>
    `;
  }).join("");
}

function renderFavorites() {
  const favDishes = state.favorites
    .map((dishId) => getDish(dishId))
    .filter(Boolean);

  if (!favDishes.length) {
    favoritesList.innerHTML = "<p class='meta'>Aún no guardas favoritos.</p>";
    return;
  }

  favoritesList.innerHTML = favDishes.map((dish) => `
    <div class="admin-item">
      <h4>${dish.title}</h4>
      <p class="meta">$${formatCOP(dish.price)} · ${Number(dish.calories || 0)} kcal</p>
      <button class="secondary add-cart" data-id="${dish.id}" ${dish.soldOut ? "disabled" : ""}>Pedir rápido</button>
      <button class="danger toggle-favorite" data-id="${dish.id}">Quitar</button>
    </div>
  `).join("");
}

function renderCravings() {
  const available = state.cravings.filter((item) => !item.soldOut);
  if (!available.length) {
    cravingsList.innerHTML = "<p class='meta'>No hay antojos disponibles ahora.</p>";
    return;
  }

  cravingsList.innerHTML = available.map((item) => `
    <article class="menu-item">
      <h4>${item.title}</h4>
      <p class="meta">${item.restaurantName}</p>
      <p class="meta">${item.description}</p>
      <p class="meta">Calorías: ${Number(item.calories || 0)} kcal</p>
      <p class="price">$${formatCOP(item.price)}</p>
    </article>
  `).join("");
}

function renderCart() {
  if (!state.cart.length) {
    cartList.innerHTML = "<p class='meta'>Tu carrito está vacío.</p>";
    cartSubtotal.textContent = "0";
    cartDiscount.textContent = "0";
    cartSubscriptionFee.textContent = "0";
    cartTotal.textContent = "0";
    promoBadge.classList.add("hidden");
    return;
  }

  cartList.innerHTML = state.cart.map((item, idx) => {
    const dish = getDish(item.dishId);
    if (!dish) return "";

    return `
      <div class="cart-item">
        <strong>${dish.title}</strong>
        <p class="meta">Cantidad: ${item.quantity}</p>
        <p class="meta">Calorías estimadas: ${Number(dish.calories || 0) * Number(item.quantity)} kcal</p>
        <p class="price">$${formatCOP(Number(dish.price) * Number(item.quantity))}</p>
        <button class="secondary remove-cart" data-index="${idx}">Eliminar</button>
      </div>
    `;
  }).join("");

  const totals = computeTotals();
  cartSubtotal.textContent = formatCOP(totals.subtotal);
  cartDiscount.textContent = formatCOP(totals.discount);
  cartSubscriptionFee.textContent = formatCOP(totals.subscriptionFee);
  cartTotal.textContent = formatCOP(totals.total);

  if (totals.promo > 0) {
    promoBadge.textContent = `${totals.promo}%`;
    promoBadge.classList.remove("hidden");
  } else {
    promoBadge.classList.add("hidden");
  }
}

function renderAdminRestaurants() {
  if (!state.restaurants.length) {
    restaurantsAdminList.innerHTML = "<p class='meta'>Sin restaurantes.</p>";
    return;
  }

  const isAdmin = state.user?.role === "admin";
  restaurantsAdminList.innerHTML = state.restaurants.map((restaurant) => `
    <div class="admin-item">
      <h4>${restaurant.name}</h4>
      <p class="meta">${restaurant.location}</p>
      ${isAdmin ? `
        <button class="secondary edit-restaurant-toggle" data-id="${restaurant.id}">Editar</button>
        <button class="danger delete-restaurant" data-id="${restaurant.id}">Eliminar restaurante</button>
        <form class="edit-restaurant-form hidden" data-id="${restaurant.id}">
          <label class="field"><span>Nombre</span><input name="name" value="${restaurant.name}" required></label>
          <label class="field"><span>Ubicación</span><input name="location" value="${restaurant.location}" required></label>
          <button class="secondary" type="submit">Guardar cambios</button>
        </form>
      ` : `<p class='meta'>Solo admin gestiona restaurantes.</p>`}
    </div>
  `).join("");
}

function renderAdminMenu() {
  if (!state.dishes.length) {
    adminMenuList.innerHTML = "<p class='meta'>Sin platos cargados.</p>";
    return;
  }

  adminMenuList.innerHTML = state.dishes.map((dish) => {
    const restaurant = getRestaurant(dish.restaurantId);
    return `
      <div class="admin-item">
        <h4>${dish.title}</h4>
        <p class="meta">${restaurant ? restaurant.name : "Sin restaurante"}</p>
        <p class="meta">$${formatCOP(dish.price)} · ${dish.description}</p>
        <p class="meta">Calorías: ${Number(dish.calories || 0)} kcal</p>
        <label class="field inline">
          <input type="checkbox" class="toggle-sold-out" data-id="${dish.id}" ${dish.soldOut ? "checked" : ""}>
          <span>Agotado</span>
        </label>
        <button class="secondary edit-dish-toggle" data-id="${dish.id}">Editar plato</button>
        <button class="danger delete-dish" data-id="${dish.id}">Eliminar plato</button>

        <form class="edit-dish-form hidden" data-id="${dish.id}">
          <label class="field"><span>Título</span><input name="title" value="${dish.title}" required></label>
          <label class="field"><span>Descripción</span><input name="description" value="${dish.description}" required></label>
          <label class="field"><span>Precio</span><input type="number" name="price" value="${dish.price}" min="0" required></label>
          <label class="field"><span>Calorías</span><input type="number" name="calories" value="${Number(dish.calories || 0)}" min="0" required></label>
          <label class="field"><span>Ingredientes</span><input name="ingredients" value="${dish.ingredients || ""}"></label>
          <label class="field"><span>Foto URL</span><input name="photo" value="${dish.photo || ""}"></label>
          <button class="secondary" type="submit">Guardar plato</button>
        </form>
      </div>
    `;
  }).join("");
}

function renderCravingAdmin() {
  if (!state.cravings.length) {
    cravingAdminList.innerHTML = "<p class='meta'>Sin productos en Pa'comer algo.</p>";
    return;
  }

  cravingAdminList.innerHTML = state.cravings.map((item) => `
    <div class="admin-item">
      <h4>${item.title}</h4>
      <p class="meta">${item.restaurantName} · $${formatCOP(item.price)}</p>
      <p class="meta">${item.description} · ${Number(item.calories || 0)} kcal</p>
      <label class="field inline">
        <input type="checkbox" class="toggle-craving-sold-out" data-id="${item.id}" ${item.soldOut ? "checked" : ""}>
        <span>Agotado</span>
      </label>
      <button class="secondary edit-craving-toggle" data-id="${item.id}">Editar antojo</button>
      <button class="danger delete-craving" data-id="${item.id}">Eliminar antojo</button>

      <form class="edit-craving-form hidden" data-id="${item.id}">
        <label class="field"><span>Título</span><input name="title" value="${item.title}" required></label>
        <label class="field"><span>Descripción</span><input name="description" value="${item.description}" required></label>
        <label class="field"><span>Precio</span><input type="number" name="price" min="0" value="${item.price}" required></label>
        <label class="field"><span>Calorías</span><input type="number" name="calories" min="0" value="${Number(item.calories || 0)}" required></label>
        <label class="field"><span>Ingredientes</span><input name="ingredients" value="${item.ingredients || ""}"></label>
        <label class="field"><span>Foto URL</span><input name="photo" value="${item.photo || ""}"></label>
        <button class="secondary" type="submit">Guardar antojo</button>
      </form>
    </div>
  `).join("");
}

function renderOrderStatus() {
  if (!state.latestOrder) {
    orderStatus.textContent = "Aún no tienes pedidos activos.";
    return;
  }

  const order = state.latestOrder;
  orderStatus.innerHTML = `
    <p><strong>Pedido #${order.id}</strong></p>
    <p class="meta">Estado: <strong>${order.statusLabel}</strong></p>
    <p class="meta">Recogida: ${order.pickupTime}</p>
    <p class="meta">Pago: ${order.paymentMethod === "online" ? "Online" : "En caja"}</p>
    <p class="meta">Subtotal: $${formatCOP(order.subtotal || 0)} · Descuento: $${formatCOP(order.discountAmount || 0)} · Suscripción: $${formatCOP(order.subscriptionFee || 0)} · Total: $${formatCOP(order.totalAmount || 0)}</p>
    <p><span class="badge fast">Fila Exclusiva habilitada</span></p>
  `;
}

function renderSubscriptions() {
  if (!state.subscriptions.length) {
    subscriptionsList.innerHTML = "<p class='meta'>No tienes suscripciones activas.</p>";
    return;
  }

  subscriptionsList.innerHTML = state.subscriptions.map((sub) => {
    const items = sub.items.map((item) => `${item.title} x${item.quantity}`).join(", ");
    const freqLabel = sub.frequency === "DAILY" ? "Diaria" : sub.frequency === "WEEKLY" ? "Semanal" : "Mensual";
    return `
      <div class="admin-item">
        <h4>${sub.name}</h4>
        <p class="meta">Frecuencia: ${freqLabel} · Costo plan: $${formatCOP(sub.planFee)}</p>
        <p class="meta">Recogida: ${sub.pickupTime} · Pago: ${sub.paymentMethod === "online" ? "Online" : "En caja"}</p>
        <p class="meta">Items: ${items || "Sin items"}</p>
        <button class="danger delete-subscription" data-id="${sub.id}">Cancelar suscripción</button>
      </div>
    `;
  }).join("");
}

function renderDocs() {
  docsContent.innerHTML = `
    <h2>Estado actual</h2>
    <ul>
      <li>Autenticación por rol: admin / restaurant / student.</li>
      <li>Contraseñas migradas a bcryptjs (con compatibilidad legacy).</li>
      <li>Favoritos para pedir rápido.</li>
      <li>Módulo Pa'comer algo con CRUD, agotado y permisos por rol.</li>
      <li>Suscripción con frecuencia diaria/semanal/mensual y costo sumado al total.</li>
      <li>Recuperación de contraseña por código.</li>
    </ul>
  `;
}

function renderAll() {
  renderRestaurantSelectors();
  renderMenus();
  renderFavorites();
  renderCravings();
  renderCart();
  renderAdminRestaurants();
  renderAdminMenu();
  renderCravingAdmin();
  renderOrderStatus();
  renderSubscriptions();
  renderDocs();
}

async function refreshData() {
  const data = await api("/api/bootstrap");
  state.user = data.user;
  state.restaurants = data.restaurants;
  state.dishes = data.dishes;
  state.cravings = data.cravings || [];
  state.favorites = data.favorites || [];
  state.reviews = data.reviews;
  state.subscriptions = data.subscriptions;
  state.latestOrder = data.latestOrder;
  state.cart = state.cart.filter((item) => getDish(item.dishId));

  showApp();
  renderAll();
}

function addToCart(dishId) {
  const existing = state.cart.find((item) => Number(item.dishId) === Number(dishId));
  if (existing) existing.quantity += 1;
  else state.cart.push({ dishId: Number(dishId), quantity: 1 });
  renderCart();
}

function removeFromCart(index) {
  state.cart.splice(index, 1);
  renderCart();
}

async function toggleFavorite(dishId) {
  if (isFavorite(dishId)) {
    await api(`/api/favorites/${dishId}`, { method: "DELETE" });
  } else {
    await api("/api/favorites", {
      method: "POST",
      body: JSON.stringify({ dishId: Number(dishId) })
    });
  }
  await refreshData();
}

async function placeOrder() {
  if (!state.cart.length) throw new Error("Debes agregar al menos un plato al carrito.");
  if (!pickupTime.value) throw new Error("Selecciona una hora de recogida.");

  const wantsSubscription = betweenClassesMode.checked;
  if (wantsSubscription && !subscriptionName.value.trim()) {
    throw new Error("Debes indicar nombre para la suscripción.");
  }

  const order = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      pickupTime: pickupTime.value,
      paymentMethod: paymentMethod.value,
      items: state.cart,
      subscription: wantsSubscription
        ? { enabled: true, frequency: subscriptionFrequency.value }
        : { enabled: false }
    })
  });

  if (wantsSubscription) {
    await api("/api/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        name: subscriptionName.value.trim(),
        frequency: subscriptionFrequency.value,
        pickupTime: pickupTime.value,
        paymentMethod: paymentMethod.value,
        items: state.cart
      })
    });
  }

  state.cart = [];
  betweenClassesMode.checked = false;
  subscriptionName.value = "";
  subscriptionFields.classList.add("hidden");

  await refreshData();

  setTimeout(async () => {
    try {
      if (canAccessAdmin()) {
        await api(`/api/orders/${order.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "ready", statusLabel: "Listo para recoger" })
        });
        await refreshData();
      }
      alert("Notificación FoodLab: Tu pedido está listo para recoger por la Fila Exclusiva.");
    } catch (error) {
      console.error(error);
    }
  }, 5000);
}

async function login(email, password) {
  const result = await api("/api/auth/login", {
    method: "POST",
    headers: {},
    body: JSON.stringify({ email, password })
  });

  state.token = result.token;
  state.user = result.user;
  localStorage.setItem("foodlab_token", state.token);
  await refreshData();
  setView("student");
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {}

  clearSession();
  state.cart = [];
  showLogin();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await login(loginEmail.value.trim().toLowerCase(), loginPassword.value);
    loginForm.reset();
  } catch (error) {
    alert(error.message);
  }
});

requestResetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/api/auth/request-reset", {
      method: "POST",
      headers: {},
      body: JSON.stringify({ email: resetEmail.value.trim().toLowerCase() })
    });
    resetFeedback.textContent = `${result.message} Código demo: ${result.resetCode || "(revisa correo)"}`;
  } catch (error) {
    resetFeedback.textContent = error.message;
  }
});

confirmResetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/api/auth/reset-password", {
      method: "POST",
      headers: {},
      body: JSON.stringify({
        email: confirmEmail.value.trim().toLowerCase(),
        resetCode: resetCode.value.trim(),
        newPassword: newPassword.value
      })
    });

    resetFeedback.textContent = result.message;
    confirmResetForm.reset();
  } catch (error) {
    resetFeedback.textContent = error.message;
  }
});

logoutBtn.addEventListener("click", async () => {
  await logout();
});

tabStudent.addEventListener("click", () => setView("student"));
tabAdmin.addEventListener("click", () => {
  if (!canAccessAdmin()) {
    alert("Acceso restringido: solo restaurantes y administrador.");
    return;
  }
  setView("admin");
});
tabDocs.addEventListener("click", () => setView("docs"));

restaurantFilter.addEventListener("change", renderMenus);
betweenClassesMode.addEventListener("change", () => {
  subscriptionFields.classList.toggle("hidden", !betweenClassesMode.checked);
  renderCart();
});
subscriptionFrequency.addEventListener("change", renderCart);

placeOrderBtn.addEventListener("click", async () => {
  try {
    await placeOrder();
  } catch (error) {
    alert(error.message);
  }
});

restaurantForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/restaurants", {
      method: "POST",
      body: JSON.stringify({ name: restaurantName.value.trim(), location: restaurantLocation.value.trim() })
    });
    restaurantForm.reset();
    await refreshData();
  } catch (error) {
    alert(error.message);
  }
});

menuForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/dishes", {
      method: "POST",
      body: JSON.stringify({
        restaurantId: Number(menuRestaurant.value),
        title: dishTitle.value.trim(),
        description: dishDescription.value.trim(),
        price: Number(dishPrice.value),
        calories: Number(dishCalories.value),
        ingredients: dishIngredients.value.trim(),
        photo: dishPhoto.value.trim(),
        soldOut: dishSoldOut.checked
      })
    });
    menuForm.reset();
    await refreshData();
  } catch (error) {
    alert(error.message);
  }
});

cravingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/cravings", {
      method: "POST",
      body: JSON.stringify({
        restaurantId: Number(cravingRestaurant.value),
        title: cravingTitle.value.trim(),
        description: cravingDescription.value.trim(),
        price: Number(cravingPrice.value),
        calories: Number(cravingCalories.value),
        ingredients: cravingIngredients.value.trim(),
        photo: cravingPhoto.value.trim(),
        soldOut: cravingSoldOut.checked
      })
    });
    cravingForm.reset();
    await refreshData();
  } catch (error) {
    alert(error.message);
  }
});

menuList.addEventListener("click", async (event) => {
  const addBtn = event.target.closest("button.add-cart");
  if (addBtn) {
    addToCart(Number(addBtn.dataset.id));
    return;
  }

  const favBtn = event.target.closest("button.toggle-favorite");
  if (favBtn) {
    try {
      await toggleFavorite(Number(favBtn.dataset.id));
    } catch (error) {
      alert(error.message);
    }
  }
});

menuList.addEventListener("submit", async (event) => {
  const form = event.target.closest("form.review-form");
  if (!form) return;
  event.preventDefault();

  const data = new FormData(form);
  try {
    await api(`/api/dishes/${form.dataset.dishId}/reviews`, {
      method: "POST",
      body: JSON.stringify({
        rating: Number(data.get("rating")),
        comment: String(data.get("comment") || "").trim()
      })
    });
    await refreshData();
  } catch (error) {
    alert(error.message);
  }
});

favoritesList.addEventListener("click", async (event) => {
  const addBtn = event.target.closest("button.add-cart");
  if (addBtn) {
    addToCart(Number(addBtn.dataset.id));
    return;
  }

  const favBtn = event.target.closest("button.toggle-favorite");
  if (favBtn) {
    try {
      await toggleFavorite(Number(favBtn.dataset.id));
    } catch (error) {
      alert(error.message);
    }
  }
});

cartList.addEventListener("click", (event) => {
  const button = event.target.closest("button.remove-cart");
  if (!button) return;
  removeFromCart(Number(button.dataset.index));
});

restaurantsAdminList.addEventListener("click", async (event) => {
  const editBtn = event.target.closest("button.edit-restaurant-toggle");
  if (editBtn) {
    const form = restaurantsAdminList.querySelector(`form.edit-restaurant-form[data-id='${editBtn.dataset.id}']`);
    if (form) form.classList.toggle("hidden");
    return;
  }

  const deleteBtn = event.target.closest("button.delete-restaurant");
  if (!deleteBtn) return;
  if (!confirm("Se eliminará el restaurante y sus platos. ¿Continuar?")) return;

  try {
    await api(`/api/restaurants/${deleteBtn.dataset.id}`, { method: "DELETE" });
    await refreshData();
  } catch (error) {
    alert(error.message);
  }
});

restaurantsAdminList.addEventListener("submit", async (event) => {
  const form = event.target.closest("form.edit-restaurant-form");
  if (!form) return;
  event.preventDefault();

  const data = new FormData(form);
  try {
    await api(`/api/restaurants/${form.dataset.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: String(data.get("name") || "").trim(),
        location: String(data.get("location") || "").trim()
      })
    });
    await refreshData();
  } catch (error) {
    alert(error.message);
  }
});

adminMenuList.addEventListener("change", async (event) => {
  const soldOut = event.target.closest("input.toggle-sold-out");
  if (!soldOut) return;

  try {
    await api(`/api/dishes/${soldOut.dataset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ soldOut: soldOut.checked })
    });
    await refreshData();
  } catch (error) {
    alert(error.message);
  }
});

adminMenuList.addEventListener("click", async (event) => {
  const editBtn = event.target.closest("button.edit-dish-toggle");
  if (editBtn) {
    const form = adminMenuList.querySelector(`form.edit-dish-form[data-id='${editBtn.dataset.id}']`);
    if (form) form.classList.toggle("hidden");
    return;
  }

  const deleteBtn = event.target.closest("button.delete-dish");
  if (!deleteBtn) return;
  if (!confirm("¿Eliminar este plato?")) return;

  try {
    await api(`/api/dishes/${deleteBtn.dataset.id}`, { method: "DELETE" });
    await refreshData();
  } catch (error) {
    alert(error.message);
  }
});

adminMenuList.addEventListener("submit", async (event) => {
  const form = event.target.closest("form.edit-dish-form");
  if (!form) return;
  event.preventDefault();

  const data = new FormData(form);
  try {
    await api(`/api/dishes/${form.dataset.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: String(data.get("title") || "").trim(),
        description: String(data.get("description") || "").trim(),
        price: Number(data.get("price")),
        calories: Number(data.get("calories")),
        ingredients: String(data.get("ingredients") || "").trim(),
        photo: String(data.get("photo") || "").trim()
      })
    });
    await refreshData();
  } catch (error) {
    alert(error.message);
  }
});

cravingAdminList.addEventListener("change", async (event) => {
  const soldOut = event.target.closest("input.toggle-craving-sold-out");
  if (!soldOut) return;

  try {
    await api(`/api/cravings/${soldOut.dataset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ soldOut: soldOut.checked })
    });
    await refreshData();
  } catch (error) {
    alert(error.message);
  }
});

cravingAdminList.addEventListener("click", async (event) => {
  const editBtn = event.target.closest("button.edit-craving-toggle");
  if (editBtn) {
    const form = cravingAdminList.querySelector(`form.edit-craving-form[data-id='${editBtn.dataset.id}']`);
    if (form) form.classList.toggle("hidden");
    return;
  }

  const deleteBtn = event.target.closest("button.delete-craving");
  if (!deleteBtn) return;
  if (!confirm("¿Eliminar este antojo?")) return;

  try {
    await api(`/api/cravings/${deleteBtn.dataset.id}`, { method: "DELETE" });
    await refreshData();
  } catch (error) {
    alert(error.message);
  }
});

cravingAdminList.addEventListener("submit", async (event) => {
  const form = event.target.closest("form.edit-craving-form");
  if (!form) return;
  event.preventDefault();

  const data = new FormData(form);
  try {
    await api(`/api/cravings/${form.dataset.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: String(data.get("title") || "").trim(),
        description: String(data.get("description") || "").trim(),
        price: Number(data.get("price")),
        calories: Number(data.get("calories")),
        ingredients: String(data.get("ingredients") || "").trim(),
        photo: String(data.get("photo") || "").trim()
      })
    });
    await refreshData();
  } catch (error) {
    alert(error.message);
  }
});

subscriptionsList.addEventListener("click", async (event) => {
  const deleteBtn = event.target.closest("button.delete-subscription");
  if (!deleteBtn) return;
  if (!confirm("¿Cancelar esta suscripción?")) return;

  try {
    await api(`/api/subscriptions/${deleteBtn.dataset.id}`, { method: "DELETE" });
    await refreshData();
  } catch (error) {
    alert(error.message);
  }
});

(async function init() {
  if (!state.token) {
    showLogin();
    return;
  }

  try {
    await refreshData();
    setView("student");
  } catch {
    clearSession();
    showLogin();
  }
})();
