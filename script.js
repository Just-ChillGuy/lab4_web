// script.js — финальная версия, использующая Open-Meteo (без ключей)

const weatherContainer = document.getElementById("weatherContainer");
const suggestionsEl = document.getElementById("suggestions");
const cityError = document.getElementById("cityError");
const cityInput = document.getElementById("cityInput");
const refreshBtn = document.getElementById("refreshBtn");
const addCityBtn = document.getElementById("addCityBtn");

let savedCities = (() => {
  try {
    return JSON.parse(localStorage.getItem("cities")) || [];
  } catch (e) {
    return [];
  }
})();
let selectedSuggestion = null;

const weatherCodes = {
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

function saveCities() {
  try {
    localStorage.setItem("cities", JSON.stringify(savedCities));
  } catch (e) {
    console.warn("Не удалось сохранить cities:", e);
  }
}
function uid() { return Math.random().toString(36).slice(2, 9); }
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
}
function humanDate(iso) {
  const d = new Date(iso);
  const months = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

// Скрыть suggestions по умолчанию
if (suggestionsEl) suggestionsEl.style.display = "none";

let suggTimeout = null;
cityInput.addEventListener("input", () => {
  clearTimeout(suggTimeout);
  const v = cityInput.value.trim();
  selectedSuggestion = null;
  cityError.textContent = "";
  if (!v) { suggestionsEl.style.display = "none"; suggestionsEl.innerHTML = ""; return; }

  suggTimeout = setTimeout(async () => {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(v)}&count=8&language=ru&format=json`;
      const res = await fetch(url);
      if (!res.ok) { suggestionsEl.style.display = "none"; return; }
      const data = await res.json();
      if (!data.results || data.results.length === 0) {
        suggestionsEl.style.display = "none";
        suggestionsEl.innerHTML = "";
        return;
      }
      suggestionsEl.innerHTML = data.results
        .map(r => {
          const disp = `${r.name}${r.admin1 ? ", " + r.admin1 : ""}${r.country ? ", " + r.country : ""}`;
          return `<li 
                    data-lat="${r.latitude}" 
                    data-lon="${r.longitude}" 
                    data-display="${escapeHtml(disp)}"
                  >${escapeHtml(disp)}</li>`;
        }).join("");
      suggestionsEl.style.display = "block";
    } catch (err) { 
      console.warn("Ошибка подсказок", err);
      suggestionsEl.style.display = "none";
    }
  }, 250);
});

suggestionsEl.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  const lat = parseFloat(li.dataset.lat);
  const lon = parseFloat(li.dataset.lon);
  const display = li.dataset.display || li.textContent.trim();

  cityInput.value = display;
  suggestionsEl.style.display = "none";
  suggestionsEl.innerHTML = "";
  selectedSuggestion = { name: display.split(",")[0].trim(), displayName: display, lat, lon };
});

async function geocodeCity(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=ru&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Ошибка геокодинга");
  return res.json();
}

async function fetchForecastByCoords(lat, lon) {
  // forecast_days можно задать, но Open-Meteo вернёт минимум нужное количество.
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days=4`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Ошибка получения прогноза");
  return res.json();
}

function createCityCard(city) {
  const card = document.createElement("div");
  card.className = "weather-card";
  card.dataset.id = city.id;
  card.innerHTML = `
    <div class="card-top">
      <div>
        <div class="card-title">${escapeHtml(city.displayName || city.name)}</div>
        <div class="card-meta">${city.isGeo ? "Текущее местоположение" : "Город"}</div>
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
    savedCities = savedCities.filter(c => c.id !== city.id);
    saveCities();
    renderAll();
  });
  return card;
}

async function loadForecastForCard(city, cardEl) {
  const body = cardEl.querySelector(".card-body");
  body.innerHTML = `<p class="loading">Загрузка...</p>`;
  try {
    let { lat, lon } = city;
    if ((!lat || !lon) && !city.isGeo) {
      const geo = await geocodeCity(city.name);
      if (!geo.results || geo.results.length === 0) {
        body.innerHTML = `<p class="error">Город не найден.</p>`;
        return;
      }
      const g = geo.results[0];
      lat = g.latitude; lon = g.longitude;
      city.lat = lat; city.lon = lon;
      saveCities();
    }

    const f = await fetchForecastByCoords(lat, lon);
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
      const weatherText = (typeof codes[i] !== "undefined" && weatherCodes[codes[i]]) ? weatherCodes[codes[i]] : "—";
      html += `<div class="day"><b>${dateLabel}${timeVal ? ` (${humanDate(timeVal)})` : ""}:</b> ${minVal}°C — ${maxVal}°C, ${escapeHtml(weatherText)}</div>`;
    }
    body.innerHTML = html;
  } catch (err) {
    console.error("loadForecastForCard error", err);
    body.innerHTML = `<p class="error">Ошибка загрузки: ${escapeHtml(err.message || "ошибка")}</p>`;
  }
}

function renderAll() {
  weatherContainer.innerHTML = "";
  if (!Array.isArray(savedCities) || savedCities.length === 0) {
    weatherContainer.innerHTML = `<p class="loading">Нет сохранённых городов. Разрешите геолокацию или добавьте город вручную.</p>`;
    return;
  }
  for (const city of savedCities) {
    const card = createCityCard(city);
    weatherContainer.appendChild(card);
    // не ждем, чтобы не блокировать интерфейс
    loadForecastForCard(city, card);
  }
}

async function refreshAll() {
  const cards = document.querySelectorAll(".weather-card");
  for (const card of cards) {
    const city = savedCities.find(c => c.id === card.dataset.id);
    if (city) await loadForecastForCard(city, card);
  }
}
refreshBtn.addEventListener("click", () => { refreshAll(); });

async function handleAddCity() {
  const name = cityInput.value.trim();
  cityError.textContent = "";
  if (!name) { cityError.textContent = "Введите название города"; return; }

  try {
    if (selectedSuggestion && selectedSuggestion.displayName === name) {
      const best = selectedSuggestion;
      if (savedCities.some(c => Math.abs((c.lat||0) - best.lat) < 1e-6 && Math.abs((c.lon||0) - best.lon) < 1e-6)) {
        cityError.textContent = "Этот город уже добавлен."; return;
      }
      savedCities.push({ id: uid(), name: best.name, displayName: best.displayName, lat: best.lat, lon: best.lon, isGeo:false });
      saveCities(); cityInput.value=""; selectedSuggestion=null; cityError.textContent=""; renderAll();
      return;
    }

    cityError.textContent = "Проверка...";
    const geo = await geocodeCity(name);
    if (!geo.results || geo.results.length===0) { cityError.textContent="Город не найден."; return; }
    const best = geo.results[0];
    const displayName = `${best.name}${best.admin1?", "+best.admin1:""}${best.country?", "+best.country:""}`;
    if (savedCities.some(c=>Math.abs((c.lat||0)-best.latitude)<1e-6 && Math.abs((c.lon||0)-best.longitude)<1e-6)) {
      cityError.textContent = "Этот город уже добавлен."; return;
    }
    savedCities.push({ id: uid(), name: best.name, displayName, lat:best.latitude, lon:best.longitude, isGeo:false });
    saveCities(); cityInput.value=""; cityError.textContent=""; renderAll();
  } catch(err) {
    console.error("handleAddCity error", err);
    cityError.textContent="Ошибка сети";
  }
}
addCityBtn.addEventListener("click", handleAddCity);
cityInput.addEventListener("keydown",(e)=>{ if(e.key==="Enter"){ e.preventDefault(); handleAddCity(); }});

// При клике вне формы скрываем подсказки
document.addEventListener("click", (e) => {
  if (!cityInput.contains(e.target) && !suggestionsEl.contains(e.target)) {
    suggestionsEl.style.display = "none";
    suggestionsEl.innerHTML = "";
  }
});

async function init() {
  // Если нет сохранённых городов и есть геолокация — пробуем получить текущее местоположение
  if ((!savedCities || savedCities.length === 0) && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async pos=>{
      try {
        const lat = pos.coords.latitude; 
        const lon = pos.coords.longitude;

        let display = "Текущее местоположение";
        try {
          const rev = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&count=1&language=ru`);
          if (rev.ok) {
            const data = await rev.json();
            if (data.results && data.results[0]) {
              const r = data.results[0];
              display = `${r.name}${r.admin1?", "+r.admin1:""}${r.country?", "+r.country:""}`;
            }
          }
        } catch (e) {
          // обратный геокодинг не обязателен — продолжаем
        }

        const city = { id: uid(), name: "geo", displayName: display, lat, lon, isGeo:true };
        savedCities.push(city); 
        saveCities();

        const card = createCityCard(city);
        weatherContainer.appendChild(card);
        await loadForecastForCard(city, card);
      } catch(e){
        console.warn("Геолокация или обратный геокодинг не удались", e);
        renderAll();
      }
    }, err=>{
      console.log("Геолокация недоступна", err);
      renderAll();
    }, {timeout:8000});
  } else {
    renderAll();
  }
}

init();
