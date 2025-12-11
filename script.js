// script.js — финальная версия (Open-Meteo, без ключей). Показывает текущее местоположение в header.

const forecastPanel = document.getElementById("weatherContainer");
const hintList = document.getElementById("suggestions");
const errorMsg = document.getElementById("cityError");
const locationInput = document.getElementById("cityInput");
const reloadBtn = document.getElementById("refreshBtn");
const addBtn = document.getElementById("addCityBtn");
const locateBtn = document.getElementById("geoBtn");
const locationHeader = document.getElementById("currentLocation");

let storedPlaces = (() => {
  try {
    return JSON.parse(localStorage.getItem("cities")) || [];
  } catch (e) {
    return [];
  }
})();
let pickedHint = null;

const conditionMap = {
  0: "Ясно",
  1: "Частично облачно",
  2: "Облачно",
  3: "Пасмурно",
  45: "Туман",
  48: "Туман с инеем",
  51: "Мелкий дождь",
  53: "Умеренный дождь",
  55: "Сильный дождь",
  61: "Дождь",
  63: "Сильный дождь",
  65: "Сильный дождь",
  71: "Снег",
  73: "Сильный снег",
  75: "Очень сильный снег",
  80: "Ливень",
  81: "Сильный ливень",
  82: "Очень сильный ливень",
  95: "Гроза",
  96: "Гроза с небольшим градом",
  99: "Гроза с градом"
};

function persistPlaces() {
  try {
    localStorage.setItem("cities", JSON.stringify(storedPlaces));
  } catch (e) {
    console.warn("Не удалось сохранить cities:", e);
  }
}
function genId() { return Math.random().toString(36).slice(2, 9); }
function sanitize(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
}
function formatDate(iso) {
  const d = new Date(iso);
  const months = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

if (hintList) hintList.style.display = "none";

/* ---------- autocomplete (Open-Meteo geocoding) ---------- */
let hintTimeout = null;
locationInput.addEventListener("input", () => {
  clearTimeout(hintTimeout);
  const v = locationInput.value.trim();
  pickedHint = null;
  if (errorMsg) errorMsg.textContent = "";
  if (!v) { if (hintList) { hintList.style.display = "none"; hintList.innerHTML = ""; } return; }

  hintTimeout = setTimeout(async () => {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(v)}&count=8&language=ru&format=json`;
      const res = await fetch(url);
      if (!res.ok) { if (hintList) hintList.style.display = "none"; return; }
      const data = await res.json();
      if (!data.results || data.results.length === 0) {
        if (hintList) { hintList.style.display = "none"; hintList.innerHTML = ""; }
        return;
      }
      if (!hintList) return;
      hintList.innerHTML = data.results
        .map(r => {
          const disp = `${r.name}${r.admin1 ? ", " + r.admin1 : ""}${r.country ? ", " + r.country : ""}`;
          return `<li 
                    data-lat="${r.latitude}" 
                    data-lon="${r.longitude}" 
                    data-display="${sanitize(disp)}"
                  >${sanitize(disp)}</li>`;
        }).join("");
      hintList.style.display = "block";
    } catch (err) { 
      console.warn("Ошибка подсказок", err);
      if (hintList) hintList.style.display = "none";
    }
  }, 250);
});

if (hintList) {
  hintList.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const lat = parseFloat(li.dataset.lat);
    const lon = parseFloat(li.dataset.lon);
    const display = li.dataset.display || li.textContent.trim();

    locationInput.value = display;
    hintList.style.display = "none";
    hintList.innerHTML = "";
    pickedHint = { name: display.split(",")[0].trim(), displayName: display, lat, lon };
  });
}

/* ---------- geocoding / forecast helpers ---------- */
async function lookupPlace(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=ru&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Ошибка геокодинга");
  return res.json();
}

async function getForecast(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days=4`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Ошибка получения прогноза");
  return res.json();
}

async function lookupReverse(lat, lon) {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&count=1&language=ru`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.results && data.results[0]) {
      const r = data.results[0];
      return `${r.name}${r.admin1 ? ", " + r.admin1 : ""}${r.country ? ", " + r.country : ""}`;
    }
    return null;
  } catch (e) {
    console.warn("lookupReverse error", e);
    return null;
  }
}

/* ---------- update current location display ---------- */
function refreshLocationHeader() {
  const geo = storedPlaces.find(c => c.isGeo);
  if (geo && locationHeader) {
    locationHeader.textContent = `Местоположение: ${geo.displayName || 'Текущее местоположение'}`;
  } else if (locationHeader) {
    locationHeader.textContent = '';
  }
}

/* ---------- UI: cards ---------- */
function buildPlaceCard(place) {
  const card = document.createElement("div");
  card.className = "weather-card";
  card.dataset.id = place.id;
  card.innerHTML = `
    <div class="card-top">
      <div>
        <div class="card-title">${sanitize(place.displayName || place.name)}</div>
        <div class="card-meta">${place.isGeo ? "Текущее местоположение" : "Город"}</div>
      </div>
      <div class="card-actions">
        <button class="btn remove-card">Удалить</button>
      </div>
    </div>
    <div class="card-body">
      <p class="loading">Загрузка...</p>
    </div>
  `;
  const removeBtn = card.querySelector(".remove-card");
  removeBtn.addEventListener("click", () => {
    const wasGeo = storedPlaces.find(c => c.id === place.id && c.isGeo);
    storedPlaces = storedPlaces.filter(c => c.id !== place.id);
    persistPlaces();
    renderPlaces();
    if (wasGeo) refreshLocationHeader();
  });
  return card;
}

async function populateCardForecast(place, cardEl) {
  const body = cardEl.querySelector(".card-body");
  body.innerHTML = `<p class="loading">Загрузка...</p>`;
  try {
    let { lat, lon } = place;
    if ((!lat || !lon) && !place.isGeo) {
      const geo = await lookupPlace(place.name);
      if (!geo.results || geo.results.length === 0) {
        body.innerHTML = `<p class="error">Город не найден.</p>`;
        return;
      }
      const g = geo.results[0];
      lat = g.latitude; lon = g.longitude;
      place.lat = lat; place.lon = lon;
      persistPlaces();
    }

    const f = await getForecast(lat, lon);
    const times = f.daily && f.daily.time ? f.daily.time : [];
    const tmin = f.daily && f.daily.temperature_2m_min ? f.daily.temperature_2m_min : [];
    const tmax = f.daily && f.daily.temperature_2m_max ? f.daily.temperature_2m_max : [];
    const codes = f.daily && f.daily.weathercode ? f.daily.weathercode : [];

    let html = "";
    for (let i = 0; i < 3; i++) {
      const dateLabel = i === 0 ? "Сегодня" : i === 1 ? "Завтра" : "Послезавтра";
      const timeVal = times[i] || null;
      const minVal = (typeof tmin[i] !== "undefined") ? Math.round(tmin[i]) : "—";
      const maxVal = (typeof tmax[i] !== "undefined") ? Math.round(tmax[i]) : "—";
      const weatherText = (typeof codes[i] !== "undefined" && conditionMap[codes[i]]) ? conditionMap[codes[i]] : "—";
      html += `<div class="day"><div><b>${dateLabel}${timeVal ? ` (${formatDate(timeVal)})` : ""}:</b><div class="desc">${sanitize(weatherText)}</div></div><div class="temps">${minVal}°C — ${maxVal}°C</div></div>`;
    }
    body.innerHTML = html;
  } catch (err) {
    console.error("populateCardForecast error", err);
    body.innerHTML = `<p class="error">Ошибка загрузки: ${sanitize(err.message || "ошибка")}</p>`;
  }
}

/* ---------- render / refresh ---------- */
function renderPlaces() {
  forecastPanel.innerHTML = "";
  if (!Array.isArray(storedPlaces) || storedPlaces.length === 0) {
    forecastPanel.innerHTML = `<p class="loading">Нет сохранённых городов. Разрешите геолокацию или добавьте город вручную.</p>`;
    refreshLocationHeader();
    return;
  }
  for (const place of storedPlaces) {
    const card = buildPlaceCard(place);
    forecastPanel.appendChild(card);
    // load without awaiting to keep UI responsive
    populateCardForecast(place, card);
  }
  refreshLocationHeader();
}

async function refreshPlaces() {
  const cards = document.querySelectorAll(".weather-card");
  for (const card of cards) {
    const place = storedPlaces.find(c => c.id === card.dataset.id);
    if (place) await populateCardForecast(place, card);
  }
}
if (reloadBtn) reloadBtn.addEventListener("click", () => { refreshPlaces(); });

/* ---------- add city logic ---------- */
async function handleAddPlace() {
  const name = locationInput.value.trim();
  if (errorMsg) errorMsg.textContent = "";
  if (!name) { if (errorMsg) errorMsg.textContent = "Введите название города"; return; }

  try {
    if (pickedHint && pickedHint.displayName === name) {
      const best = pickedHint;
      if (storedPlaces.some(c => Math.abs((c.lat||0) - best.lat) < 1e-6 && Math.abs((c.lon||0) - best.lon) < 1e-6)) {
        if (errorMsg) errorMsg.textContent = "Этот город уже добавлен."; return;
      }
      storedPlaces.push({ id: genId(), name: best.name, displayName: best.displayName, lat: best.lat, lon: best.lon, isGeo:false });
      persistPlaces(); locationInput.value=""; pickedHint=null; if (errorMsg) errorMsg.textContent=""; renderPlaces();
      return;
    }

    if (errorMsg) errorMsg.textContent = "Проверка...";
    const geo = await lookupPlace(name);
    if (!geo.results || geo.results.length===0) { if (errorMsg) errorMsg.textContent="Город не найден."; return; }
    const best = geo.results[0];
    const displayName = `${best.name}${best.admin1?", "+best.admin1:""}${best.country?", "+best.country:""}`;
    if (storedPlaces.some(c=>Math.abs((c.lat||0)-best.latitude)<1e-6 && Math.abs((c.lon||0)-best.longitude)<1e-6)) {
      if (errorMsg) errorMsg.textContent = "Этот город уже добавлен."; return;
    }
    storedPlaces.push({ id: genId(), name: best.name, displayName, lat:best.latitude, lon:best.longitude, isGeo:false });
    persistPlaces(); locationInput.value=""; if (errorMsg) errorMsg.textContent=""; renderPlaces();
  } catch(err) {
    console.error("handleAddPlace error", err);
    if (errorMsg) errorMsg.textContent="Ошибка сети";
  }
}
if (addBtn) addBtn.addEventListener("click", handleAddPlace);
locationInput.addEventListener("keydown",(e)=>{ if(e.key==="Enter"){ e.preventDefault(); handleAddPlace(); }});

/* hide suggestions when clicking outside */
document.addEventListener("click", (e) => {
  if (!locationInput.contains(e.target) && hintList && !hintList.contains(e.target)) {
    hintList.style.display = "none";
    hintList.innerHTML = "";
  }
});

/* ---------- geolocation button: add or update geo city ---------- */
function getPosPromise(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Геолокация не поддерживается"));
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function upsertGeoPlace(showErrors = true) {
  try {
    const pos = await getPosPromise({ timeout: 10000 });
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    // Try reverse geocoding for human-readable name
    let display = null;
    const rev = await lookupReverse(lat, lon);
    if (rev) display = rev;
    if (!display) display = "Текущее местоположение";

    // If geo entry exists — update it; otherwise add new
    const existingGeo = storedPlaces.find(c => c.isGeo);
    if (existingGeo) {
      existingGeo.lat = lat;
      existingGeo.lon = lon;
      existingGeo.displayName = display;
      persistPlaces();
      renderPlaces();
    } else {
      const place = { id: genId(), name: "geo", displayName: display, lat, lon, isGeo: true };
      // put geo at beginning for convenience
      storedPlaces.unshift(place);
      persistPlaces();
      renderPlaces();
    }
    // update header display
    refreshLocationHeader();
    if (errorMsg) errorMsg.textContent = "";
  } catch (err) {
    console.warn("upsertGeoPlace error", err);
    if (showErrors) {
      if (err && err.code === 1 && errorMsg) errorMsg.textContent = "Доступ к геопозиции запрещён";
      else if (errorMsg) errorMsg.textContent = "Не удалось получить геопозицию";
    }
  }
}
if (locateBtn) locateBtn.addEventListener("click", () => upsertGeoPlace(true));

/* ---------- initialization ---------- */
async function bootstrap() {
  if ((!storedPlaces || storedPlaces.length === 0) && navigator.geolocation) {
    try {
      await upsertGeoPlace(false);
    } catch (e) {
      // fallback
    }
  }
  renderPlaces();
}

bootstrap();
