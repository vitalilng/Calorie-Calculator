function getToday() { return new Date().toISOString().split("T")[0]; }

const SB_URL = "https://qsyssugfcsmpomxyaahw.supabase.co";
const SB_KEY = "sb_publishable_zudfpXHorTCV4mTY9jrUwg_GBGhWYk9";
const sb = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

let entries = [];
let loadedDate = getToday();
let goal = Number(localStorage.getItem("goal")) || 2000;
let apiKey = localStorage.getItem("anthropic_key") || "";
let historyCache = null;
let historyCacheDate = null;
let recipesCache = null;

const DEFAULT_PROMPT = `Ты диетолог-вегетарианец. Проанализируй питание за день.
1. БАЛАНС: оцени соотношение белков/жиров/углеводов относительно нормы
2. ПРОБЛЕМЫ: укажи конкретно что превышено или в дефиците и почему это важно
3. ЗАМЕНЫ: для каждой проблемы предложи конкретную замену из вегетарианской кухни — не просто "ешь меньше жиров", а "замени X на Y, это снизит жиры на ~Z грамм"
4. ИТОГ: одна главная рекомендация на завтра
Максимум 200 слов. Будь конкретным, не общим.`;

// --- Auth ---
function initAuth() {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), 5000);
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      clearTimeout(t);
      subscription.unsubscribe();
      if (session) resolve();
      else reject(new Error("no_session"));
    });
  });
}

function showAuthScreen() {
  el("auth-screen").style.display = "flex";
}

function showAuthError(msg) {
  el("auth-error").textContent = msg;
  el("auth-error").style.display = "block";
}

let isSignup = false;
el("auth-toggle").addEventListener("click", () => {
  isSignup = !isSignup;
  el("auth-submit").textContent = isSignup ? "Зарегистрироваться" : "Войти";
  el("auth-toggle").textContent = isSignup ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться";
  el("auth-subtitle").textContent = isSignup ? "Создай аккаунт" : "Войди чтобы синхронизировать данные";
  el("auth-error").style.display = "none";
});

el("auth-submit").addEventListener("click", async () => {
  const email = el("auth-email").value.trim();
  const password = el("auth-password").value.trim();
  if (!email || !password) { showAuthError("Заполни email и пароль"); return; }
  el("auth-submit").textContent = "...";
  el("auth-submit").disabled = true;
  const { error } = isSignup
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });
  if (error) {
    showAuthError(error.message);
    el("auth-submit").textContent = isSignup ? "Зарегистрироваться" : "Войти";
    el("auth-submit").disabled = false;
  } else {
    el("auth-screen").style.display = "none";
    checkApiKey();
  }
});

el("auth-password").addEventListener("keydown", e => { if (e.key === "Enter") el("auth-submit").click(); });

// --- DB ---
async function dbLoad(date) {
  const { data, error } = await sb.from("entries").select("*").eq("date", date).order("id");
  if (error) throw new Error(error.message);
  return data;
}

async function dbInsert(entry) {
  const { data, error } = await sb.from("entries").insert(entry).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function dbDelete(id) {
  const { error } = await sb.from("entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function dbHistory() {
  const { data, error } = await sb.from("entries")
    .select("*").neq("date", getToday())
    .order("date", { ascending: false }).order("id").limit(200);
  if (error) throw new Error(error.message);
  return data;
}

async function dbLoadRecipes() {
  const { data, error } = await sb.from("recipes").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

async function dbInsertRecipe(recipe) {
  const { data, error } = await sb.from("recipes").insert(recipe).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function dbDeleteRecipe(id) {
  const { error } = await sb.from("recipes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// --- Anthropic API ---
async function searchOpenFoodFacts(query) {
  const { data: { session } } = await sb.auth.getSession();
  const token = session?.access_token || SB_KEY;

  const res = await fetch("https://qsyssugfcsmpomxyaahw.supabase.co/functions/v1/food-search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
    },
    body: JSON.stringify({ query })
  });

  if (!res.ok) return null;
  const data = await res.json();

  const product = data.products?.find(p => {
    const n = p.nutriments;
    return n && (n["energy-kcal_100g"] || n["energy_100g"]);
  });

  if (!product) return null;
  const n = product.nutriments;
  const kcal = n["energy-kcal_100g"] || Math.round((n["energy_100g"] || 0) / 4.184);

  return {
    kcal:    Math.round(kcal                    || 0),
    protein: Math.round(n["proteins_100g"]      || 0),
    fat:     Math.round(n["fat_100g"]           || 0),
    carbs:   Math.round(n["carbohydrates_100g"] || 0),
    fiber:   Math.round(n["fiber_100g"]         || 0),
    name:    String(product.product_name        || query).slice(0, 35),
  };
}

async function estimateNutrition(text) {
  const weightMatch = text.match(/(\d+(?:\.\d+)?)\s*(г|гр|g|мл|ml|л|l|кг|kg)/i);
  const multiplier = weightMatch
    ? (["кг","kg","л","l"].includes(weightMatch[2].toLowerCase())
        ? parseFloat(weightMatch[1]) * 10
        : parseFloat(weightMatch[1]) / 100)
    : null;

  const cleanText = weightMatch
    ? text.replace(/\d+(?:\.\d+)?\s*(г|гр|g|мл|ml|л|l|кг|kg)/gi, "").trim()
    : text;

  // OFF только для латиницы с весом
  const hasCyrillic = /[а-яёА-ЯЁ]/.test(cleanText);
  if (!hasCyrillic && multiplier !== null) {
    try {
      const off = await searchOpenFoodFacts(cleanText);
      if (off) {
        return {
          kcal:    Math.round(off.kcal    * multiplier),
          protein: Math.round(off.protein * multiplier),
          fat:     Math.round(off.fat     * multiplier),
          carbs:   Math.round(off.carbs   * multiplier),
          fiber:   Math.round(off.fiber   * multiplier),
          name:    off.name,
        };
      }
    } catch(e) { /* fall through to AI */ }
  }

<<<<<<< Updated upstream
  // AI — всегда получает оригинальный text, считает итог сам
=======
  // Fallback to AI
>>>>>>> Stashed changes
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      temperature: 0,
      system: 'You are a precise nutrition calculator. For the given food or dish:\n1. Break it into individual ingredients with their amounts\n2. Calculate kcal, protein, fat, carbs, fiber for each ingredient\n3. Sum everything up\n4. Return ONLY compact JSON with total values, no spaces, no markdown:\n{"kcal":number,"protein":number,"fat":number,"carbs":number,"fiber":number,"name":"Russian dish name max 25 chars"}\nIf no amount specified, assume 1 standard serving. Input can be in any language (Russian, English, Romanian or other) — always respond in JSON only.',
      messages: [{ role: "user", content: text }]
    })
  });
  const rawText = await res.text();
  if (!res.ok) throw new Error("API " + res.status + ": " + rawText.slice(0, 100));
  const data = JSON.parse(rawText);
  const raw = data.content?.find(b => b.type === "text")?.text || "{}";
  try {
    const match = raw.match(/\{[\s\S]*?\}/);
    const n = JSON.parse(match ? match[0] : "{}");
    return {
      kcal:    Math.round(Math.max(0, Number(n.kcal)    || 0)),
      protein: Math.round(Math.max(0, Number(n.protein) || 0)),
      fat:     Math.round(Math.max(0, Number(n.fat)     || 0)),
      carbs:   Math.round(Math.max(0, Number(n.carbs)   || 0)),
      fiber:   Math.round(Math.max(0, Number(n.fiber)   || 0)),
      name:    String(n.name || text).slice(0, 35),
    };
  } catch { throw new Error("Не удалось разобрать ответ AI"); }
}

// --- DOM ---
function el(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function showError(msg) { const e = el("error-msg"); e.textContent = msg; e.style.display = msg ? "block" : "none"; }
function sumEntries(arr) {
  return arr.reduce((a, e) => ({
    kcal: a.kcal + e.kcal, protein: a.protein + e.protein,
    fat: a.fat + e.fat, carbs: a.carbs + e.carbs, fiber: a.fiber + e.fiber
  }), { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 });
}
function macrosHtml(e) {
<<<<<<< Updated upstream
  return "<span style=\"color:#60a5fa\">Б " + e.protein + "г</span>" +
         "<span style=\"color:#f59e0b\">Ж " + e.fat + "г</span>" +
         "<span style=\"color:#4ade80\">У " + e.carbs + "г</span>" +
         "<span style=\"color:#c084fc\">К " + e.fiber + "г</span>";
=======
  return `<span style="color:#60a5fa">Б ${e.protein}г</span>
          <span style="color:#f59e0b">Ж ${e.fat}г</span>
          <span style="color:#4ade80">У ${e.carbs}г</span>
          <span style="color:#c084fc">К ${e.fiber}г</span>`;
>>>>>>> Stashed changes
}

function renderToday() {
  const list = el("page-today");
  list.querySelectorAll(".entry").forEach(e => e.remove());
  el("empty").style.display = entries.length ? "none" : "block";

  const totals = sumEntries(entries);

  entries.forEach(entry => {
    const div = document.createElement("div");
    div.className = "entry";
    const diff = entry.text.toLowerCase() !== (entry.name || "").toLowerCase();
<<<<<<< Updated upstream
    div.innerHTML =
      "<div class=\"entry-body\">" +
        "<div class=\"entry-name\">" + esc(entry.name || entry.text) + "</div>" +
        (diff ? "<div class=\"entry-raw\">" + esc(entry.text) + "</div>" : "") +
        "<div class=\"entry-macros\">" + macrosHtml(entry) + "</div>" +
      "</div>" +
      "<div class=\"entry-right\">" +
        "<div class=\"entry-kcal\">" + entry.kcal + "</div>" +
        "<div class=\"entry-time\">" + entry.time + "</div>" +
      "</div>" +
      "<button class=\"del-btn\" data-id=\"" + entry.id + "\">×</button>";
=======
    div.innerHTML = `
      <div class="entry-body">
        <div class="entry-name">${esc(entry.name || entry.text)}</div>
        ${diff ? `<div class="entry-raw">${esc(entry.text)}</div>` : ""}
        <div class="entry-macros">${macrosHtml(entry)}</div>
      </div>
      <div class="entry-right">
        <div class="entry-kcal">${entry.kcal}</div>
        <div class="entry-time">${entry.time}</div>
      </div>
      <button class="del-btn" data-id="${entry.id}">×</button>`;
>>>>>>> Stashed changes
    div.querySelector(".del-btn").addEventListener("click", async () => {
      try {
        await dbDelete(entry.id);
        entries = entries.filter(e => e.id !== entry.id);
        renderToday();
      } catch (e) { showError("Ошибка удаления"); }
    });
    list.appendChild(div);
  });

  updateHeader(totals);
}

function updateHeader(totals) {
  const progress = Math.min((totals.kcal / goal) * 100, 100);
  const remaining = goal - totals.kcal;
  const over = remaining < 0;
  el("kcal-num").textContent = totals.kcal;
  el("remaining").textContent = over ? "+" + Math.abs(remaining) + " перебор" : "−" + remaining + " осталось";
  el("remaining").style.color = over ? "#f87171" : "#4ade80";
  el("prog-fill").style.width = progress + "%";
  el("prog-fill").style.background = progress > 95 ? "#f87171" : progress > 75 ? "#fb923c" : "#f59e0b";
  el("m-p").textContent = totals.protein + "г";
  el("m-f").textContent = totals.fat + "г";
  el("m-c").textContent = totals.carbs + "г";
  el("m-fi").textContent = totals.fiber + "г";
}

function displayHistoryRows(rows) {
  el("hist-loading").style.display = "none";
  el("hist-content").style.display = "none";
  el("hist-empty").style.display = "none";
  if (!rows.length) { el("hist-empty").style.display = "block"; return; }

  const byDate = {};
  rows.forEach(r => { if (!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r); });

  const cont = el("hist-content");
  cont.innerHTML = "";
  Object.keys(byDate).sort().reverse().forEach(date => {
    const dayEntries = byDate[date];
    const totalKcal = dayEntries.reduce((s, e) => s + e.kcal, 0);
    const d = new Date(date + "T12:00:00");
    const label = d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });

    const block = document.createElement("div");
    block.className = "day-block";

    const header = document.createElement("div");
    header.className = "day-header";
    header.innerHTML =
      "<span class=\"day-title\">" + esc(label) + "</span>" +
      "<span class=\"day-header-right\">" +
        "<span class=\"day-kcal\">" + totalKcal + " ккал</span>" +
        "<span class=\"day-chevron\">▾</span>" +
      "</span>";
    block.appendChild(header);

    const entriesWrap = document.createElement("div");
    entriesWrap.className = "day-entries";
    dayEntries.forEach(entry => {
      const div = document.createElement("div");
      div.className = "entry";
<<<<<<< Updated upstream
      div.innerHTML =
        "<div class=\"entry-body\">" +
          "<div class=\"entry-name\">" + esc(entry.name || entry.text) + "</div>" +
          "<div class=\"entry-macros\">" + macrosHtml(entry) + "</div>" +
        "</div>" +
        "<div class=\"entry-right\">" +
          "<div class=\"entry-kcal\">" + entry.kcal + "</div>" +
          "<div class=\"entry-time\">" + entry.time + "</div>" +
        "</div>";
=======
      div.innerHTML = `
        <div class="entry-body">
          <div class="entry-name">${esc(entry.name || entry.text)}</div>
          <div class="entry-macros">${macrosHtml(entry)}</div>
        </div>
        <div class="entry-right">
          <div class="entry-kcal">${entry.kcal}</div>
          <div class="entry-time">${entry.time}</div>
        </div>`;
>>>>>>> Stashed changes
      entriesWrap.appendChild(div);
    });
    block.appendChild(entriesWrap);

    header.addEventListener("click", () => {
      const open = entriesWrap.classList.toggle("open");
      header.querySelector(".day-chevron").textContent = open ? "▴" : "▾";
    });

    cont.appendChild(block);
  });
  cont.style.display = "block";
}

async function renderHistory() {
  const today = getToday();
  if (historyCache !== null && historyCacheDate === today) {
    displayHistoryRows(historyCache);
    return;
  }
  el("hist-loading").style.display = "block";
  el("hist-content").style.display = "none";
  el("hist-empty").style.display = "none";
  try {
    const rows = await dbHistory();
    historyCache = rows;
    historyCacheDate = today;
    displayHistoryRows(rows);
  } catch (e) {
    el("hist-loading").textContent = "Ошибка загрузки истории";
  }
}

function renderRecipes(recipes) {
  el("recipes-loading").style.display = "none";
  el("recipes-empty").style.display = recipes.length ? "none" : "block";
  const cont = el("recipes-content");
  cont.innerHTML = "";
  recipes.forEach(recipe => {
    const div = document.createElement("div");
    div.className = "recipe-card";
<<<<<<< Updated upstream
    div.innerHTML =
      "<div class=\"recipe-top\">" +
        "<div class=\"recipe-body\">" +
          "<div class=\"recipe-name\">" + esc(recipe.name) + "</div>" +
          "<div class=\"recipe-ingr\">" + esc(recipe.ingredients) + "</div>" +
          "<div class=\"entry-macros\">" + macrosHtml(recipe) + "</div>" +
        "</div>" +
        "<div class=\"recipe-right\">" +
          "<div class=\"recipe-kcal\">" + recipe.kcal + "</div>" +
          "<button class=\"del-btn\">×</button>" +
        "</div>" +
      "</div>" +
      "<button class=\"recipe-add-btn\">+ Добавить в журнал</button>";
=======
    div.innerHTML = `
      <div class="recipe-top">
        <div class="recipe-body">
          <div class="recipe-name">${esc(recipe.name)}</div>
          <div class="recipe-ingr">${esc(recipe.ingredients)}</div>
          <div class="entry-macros">${macrosHtml(recipe)}</div>
        </div>
        <div class="recipe-right">
          <div class="recipe-kcal">${recipe.kcal}</div>
          <button class="del-btn">×</button>
        </div>
      </div>
      <button class="recipe-add-btn">+ Добавить в журнал</button>`;
>>>>>>> Stashed changes

    div.querySelector(".del-btn").addEventListener("click", async () => {
      try {
        await dbDeleteRecipe(recipe.id);
        recipesCache = recipesCache.filter(r => r.id !== recipe.id);
        renderRecipes(recipesCache);
      } catch (e) { showError("Ошибка удаления рецепта"); }
    });

    const addBtn = div.querySelector(".recipe-add-btn");
    addBtn.addEventListener("click", async () => {
      addBtn.disabled = true;
      addBtn.textContent = "...";
      try {
        await addRecipeToToday(recipe);
        addBtn.textContent = "✓ Добавлено";
        setTimeout(() => { addBtn.textContent = "+ Добавить в журнал"; addBtn.disabled = false; }, 1500);
      } catch(e) {
        addBtn.textContent = "+ Добавить в журнал";
        addBtn.disabled = false;
        showError("Ошибка: " + e.message);
      }
    });

    cont.appendChild(div);
  });
}

async function loadAndRenderRecipes() {
  if (recipesCache !== null) { renderRecipes(recipesCache); return; }
  el("recipes-loading").style.display = "block";
  el("recipes-content").innerHTML = "";
  el("recipes-empty").style.display = "none";
  try {
    recipesCache = await dbLoadRecipes();
    renderRecipes(recipesCache);
  } catch (e) { el("recipes-loading").textContent = "Ошибка загрузки"; }
}

async function addRecipeToToday(recipe) {
  const today = getToday();
  const { data: { session } } = await sb.auth.getSession();
  const entryData = {
    date: today,
    text: recipe.ingredients,
    name: recipe.name,
    time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    kcal: recipe.kcal,
    protein: recipe.protein,
    fat: recipe.fat,
    carbs: recipe.carbs,
    fiber: recipe.fiber,
    user_id: session.user.id,
  };
  const inserted = await dbInsert(entryData);
  if (today !== loadedDate) {
    loadedDate = today;
    el("date-label").textContent = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
    historyCache = null;
    try { entries = await dbLoad(today); } catch { entries = [inserted]; }
  } else {
    entries.push(inserted);
  }
  switchTab("today");
  renderToday();
}

function switchTab(tab) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  el("page-" + tab).classList.add("active");
  el("nav-" + tab).classList.add("active");
  if (tab === "today") {
    el("input-bar").classList.add("visible");
    updateHeader(sumEntries(entries));
  } else {
    el("input-bar").classList.remove("visible");
    if (tab === "history") renderHistory();
    else if (tab === "recipes") loadAndRenderRecipes();
  }
}

// --- Init ---
let appReady = false;

async function initApp() {
  if (appReady) return;
  appReady = true;

  el("auth-screen").style.display = "none";
  el("key-screen").style.display = "none";
  el("app").style.display = "flex";

  loadedDate = getToday();
  el("date-label").textContent = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  el("goal-display").textContent = goal;

  try {
    entries = await dbLoad(loadedDate);
  } catch (e) {
    entries = [];
    showError("Нет соединения с БД");
  }
  renderToday();

  const foodInput = el("food-input");
  const sendBtn = el("send-btn");

  foodInput.addEventListener("input", () => {
    sendBtn.classList.toggle("ready", !!foodInput.value.trim());
  });
  foodInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAdd(); }
  });
  sendBtn.addEventListener("click", handleAdd);

  async function handleAdd() {
    const text = foodInput.value.trim();
    if (!text || sendBtn.disabled) return;

    const today = getToday();
    if (today !== loadedDate) {
      loadedDate = today;
      el("date-label").textContent = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
      historyCache = null;
      try { entries = await dbLoad(today); } catch { entries = []; }
      renderToday();
    }

    showError("");
    sendBtn.disabled = true;
    sendBtn.innerHTML = "<span class=\"spinner\">◌</span>";
    sendBtn.classList.remove("ready");
    try {
      const n = await estimateNutrition(text);
      const { data: { session } } = await sb.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Нет сессии, перезагрузи страницу");
      const entryData = {
        date: today,
        text,
        name: n.name || text,
        time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        kcal: Math.round(n.kcal),
        protein: Math.round(n.protein),
        fat: Math.round(n.fat),
        carbs: Math.round(n.carbs),
        fiber: Math.round(n.fiber),
        user_id: user.id,
      };
      const inserted = await dbInsert(entryData);
      entries.push(inserted);
      foodInput.value = "";
      renderToday();
    } catch (e) { showError("Ошибка: " + e.message); }
    sendBtn.disabled = false;
    sendBtn.innerHTML = "↑";
    sendBtn.classList.toggle("ready", !!foodInput.value.trim());
  }

  el("nav-today").addEventListener("click", () => switchTab("today"));
  el("nav-history").addEventListener("click", () => switchTab("history"));
  el("nav-recipes").addEventListener("click", () => switchTab("recipes"));

  el("recipe-new-btn").addEventListener("click", () => {
    el("recipe-name-input").value = "";
    el("recipe-ingr-input").value = "";
    el("recipe-modal-error").style.display = "none";
    el("recipe-modal").style.display = "flex";
  });

  el("recipe-cancel").addEventListener("click", () => { el("recipe-modal").style.display = "none"; });

  el("recipe-save").addEventListener("click", async () => {
    const name = el("recipe-name-input").value.trim();
    const ingredients = el("recipe-ingr-input").value.trim();
    const errEl = el("recipe-modal-error");
    if (!name) { errEl.textContent = "Введи название рецепта"; errEl.style.display = "block"; return; }
    if (!ingredients) { errEl.textContent = "Введи ингредиенты"; errEl.style.display = "block"; return; }
    errEl.style.display = "none";

    const saveBtn = el("recipe-save");
    saveBtn.textContent = "...";
    saveBtn.disabled = true;

    try {
      const n = await estimateNutrition(ingredients);
      const { data: { session } } = await sb.auth.getSession();
      const recipeData = {
        user_id: session.user.id,
        name,
        ingredients,
        kcal: Math.round(n.kcal),
        protein: Math.round(n.protein),
        fat: Math.round(n.fat),
        carbs: Math.round(n.carbs),
        fiber: Math.round(n.fiber),
      };
      const inserted = await dbInsertRecipe(recipeData);
      recipesCache = recipesCache ? [inserted, ...recipesCache] : [inserted];
      renderRecipes(recipesCache);
      el("recipe-modal").style.display = "none";
    } catch(e) {
      errEl.textContent = "Ошибка: " + e.message;
      errEl.style.display = "block";
    }

    saveBtn.textContent = "Сохранить";
    saveBtn.disabled = false;
  });

  el("gear-btn").addEventListener("click", () => { el("goal-input").value = goal; el("goal-modal").style.display = "flex"; });
  el("goal-cancel").addEventListener("click", () => { el("goal-modal").style.display = "none"; });
  el("goal-confirm").addEventListener("click", () => {
    const n = parseInt(el("goal-input").value);
    if (n > 0) { goal = n; localStorage.setItem("goal", n); el("goal-display").textContent = n; renderToday(); }
    el("goal-modal").style.display = "none";
  });

  el("change-key-btn").addEventListener("click", () => {
    el("goal-modal").style.display = "none";
    localStorage.removeItem("anthropic_key");
    apiKey = "";
    el("key-input").value = "";
    el("key-screen").style.display = "flex";
    el("app").style.display = "none";
    appReady = false;
  });

  el("signout-btn").addEventListener("click", async () => {
    el("goal-modal").style.display = "none";
    await sb.auth.signOut();
    el("app").style.display = "none";
    entries = [];
    historyCache = null;
    recipesCache = null;
    appReady = false;
    showAuthScreen();
  });

<<<<<<< Updated upstream
=======

>>>>>>> Stashed changes
  // --- Analysis ---
  el("analyze-btn").addEventListener("click", async () => {
    el("analysis-modal").style.display = "flex";
    if (!entries.length) {
      el("analysis-result").textContent = "Нет данных для анализа";
      return;
    }
    el("analysis-result").textContent = "Анализирую...";
    const prompt = localStorage.getItem("analysis_prompt") || DEFAULT_PROMPT;
    const totals = sumEntries(entries);
<<<<<<< Updated upstream
    const summary = "Цель: " + goal + " ккал\nСъедено: " + totals.kcal + " ккал | Белки: " + totals.protein + "г | Жиры: " + totals.fat + "г | Углеводы: " + totals.carbs + "г | Клетчатка: " + totals.fiber + "г";
=======
    const summary = `Цель: ${goal} ккал\nСъедено: ${totals.kcal} ккал | Белки: ${totals.protein}г | Жиры: ${totals.fat}г | Углеводы: ${totals.carbs}г | Клетчатка: ${totals.fiber}г`;
>>>>>>> Stashed changes
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1024, system: prompt, messages: [{ role: "user", content: summary }] })
      });
      const data = await res.json();
      el("analysis-result").textContent = data.content?.find(b => b.type === "text")?.text || "Нет ответа";
    } catch (e) { el("analysis-result").textContent = "Ошибка: " + e.message; }
  });

  el("analysis-close").addEventListener("click", () => { el("analysis-modal").style.display = "none"; });

  el("edit-prompt-btn").addEventListener("click", () => {
    el("analysis-modal").style.display = "none";
    el("prompt-input").value = localStorage.getItem("analysis_prompt") || DEFAULT_PROMPT;
    el("prompt-modal").style.display = "flex";
  });
  el("prompt-cancel").addEventListener("click", () => { el("prompt-modal").style.display = "none"; });
  el("prompt-save").addEventListener("click", () => {
    localStorage.setItem("analysis_prompt", el("prompt-input").value.trim() || DEFAULT_PROMPT);
    el("prompt-modal").style.display = "none";
  });
}

const keyInput = el("key-input");
const keySave = el("key-save");

keyInput.addEventListener("input", () => {
  const k = keyInput.value.trim();
  keySave.classList.toggle("ready", k.startsWith("sk-ant") && k.length >= 50);
});

keySave.addEventListener("click", () => {
  const k = keyInput.value.trim();
  if (!k.startsWith("sk-ant") || k.length < 50) return;
  apiKey = k;
  localStorage.setItem("anthropic_key", k);
  el("key-screen").style.display = "none";
  if (!appReady) initApp();
});

document.addEventListener("visibilitychange", async () => {
  if (document.hidden || !appReady) return;
  const today = getToday();
  if (today !== loadedDate) {
    loadedDate = today;
    el("date-label").textContent = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
    historyCache = null;
    try { entries = await dbLoad(today); } catch { entries = []; }
    renderToday();
  }
});

// --- Startup ---
function checkApiKey() {
  if (apiKey) { initApp(); }
  else { el("key-screen").style.display = "flex"; }
}

(async () => {
  try {
    await initAuth();
    checkApiKey();
  } catch {
    showAuthScreen();
  }
})();