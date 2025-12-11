// script.js
// Все надписи на русском. OpenWeatherMap API-key уже подставлен.
document.addEventListener('DOMContentLoaded', () => {
  const API_KEY = '6f3ef467e0d6b01caee679cf1ae44d9e'; // твой ключ
  const STORAGE_KEY = 'weatherAppState_v1';

  // Элементы DOM
  const weatherContainer = document.getElementById('weather-container');
  const refreshBtn = document.getElementById('refresh');
  const cityForm = document.getElementById('city-form');
  const cityInput = document.getElementById('city-input');
  const cityError = document.getElementById('city-error');
  const suggestionsList = document.getElementById('suggestions');

  // Состояние приложения
  // mainType: 'geo' (пользователь выбрал геолокацию) или 'city' (вручную введён город) или null
  // mainCity: объект { name, lat, lon } — если пользователь ввёл город вручную как главную локацию
  // cities: массив объектов { name, lat, lon } — дополнительные города
  // note: при mainType === 'geo' мы каждый раз запрашиваем navigator.geolocation (чтобы получить свежие координаты)
  let state = {
    mainType: null,
    mainCity: null,
    cities: []
  };

  // ---------- localStorage ----------
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Не удалось сохранить состояние:', e);
    }
  }
  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed) {
        state.mainType = parsed.mainType || null;
        state.mainCity = parsed.mainCity || null;
        state.cities = Array.isArray(parsed.cities) ? parsed.cities : [];
      }
    } catch (e) {
      console.warn('Ошибка чтения состояния:', e);
    }
  }

  // ---------- Утилиты ----------
  function clearWeatherCards() {
    weatherContainer.innerHTML = '';
  }

  function createForecastCard(title, meta = {}) {
    // meta: optional, can include id, removable flag
    const card = document.createElement('article');
    card.className = 'forecast-card';
    card.setAttribute('data-title', title);

    const h2 = document.createElement('h2');
    h2.textContent = title;

    // Контролы на карточке: кнопка удаления, если это не "Текущее местоположение"
    const controls = document.createElement('div');
    controls.className = 'card-controls';

    if (meta.removable) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.title = 'Удалить город';
      removeBtn.textContent = 'Удалить';
      removeBtn.addEventListener('click', () => {
        removeCity(meta.index);
      });
      controls.appendChild(removeBtn);
    }

    h2.appendChild(controls);
    card.appendChild(h2);

    const dailyDiv = document.createElement('div');
    dailyDiv.className = 'daily-forecast';
    const loading = document.createElement('p');
    loading.className = 'loading';
    loading.textContent = 'Загрузка...';
    dailyDiv.appendChild(loading);
    card.appendChild(dailyDiv);

    weatherContainer.appendChild(card);
    return card;
  }

  function showCardError(card, text = 'Ошибка загрузки данных') {
    const dailyDiv = card.querySelector('.daily-forecast');
    dailyDiv.innerHTML = `<p class="forecast-error">${text}</p>`;
  }

  // ---------- Запрос погоды (One Call) ----------
  // Возвращает промис с данными или выбрасывает ошибку
  function fetchWeatherData(lat, lon) {
    const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&exclude=minutely,hourly,alerts&units=metric&lang=ru&appid=${API_KEY}`;
    return fetch(url).then(r => {
      if (!r.ok) throw new Error(`Ошибка сети ${r.status}`);
      return r.json();
    });
  }

  function renderWeatherToCard(card, data) {
    const dailyDiv = card.querySelector('.daily-forecast');
    dailyDiv.innerHTML = '';
    const labels = ['Сегодня', 'Завтра', 'Послезавтра'];

    for (let i = 0; i < 3; i++) {
      const day = data.daily && data.daily[i];
      if (!day) break;

      const dayElem = document.createElement('div');
      dayElem.className = 'day';

      const dateP = document.createElement('p');
      dateP.className = 'date';
      dateP.textContent = labels[i];
      dayElem.appendChild(dateP);

      const icon = document.createElement('img');
      icon.className = 'icon';
      const code = day.weather[0].icon;
      icon.src = `https://openweathermap.org/img/wn/${code}@2x.png`;
      icon.alt = day.weather[0].description || '';
      dayElem.appendChild(icon);

      const desc = document.createElement('p');
      desc.className = 'desc';
      desc.textContent = day.weather[0].description || '';
      dayElem.appendChild(desc);

      const temp = document.createElement('p');
      temp.className = 'temp';
      const min = Math.round(day.temp.min);
      const max = Math.round(day.temp.max);
      temp.textContent = `${min > 0 ? '+' + min : min}°C / ${max > 0 ? '+' + max : max}°C`;
      dayElem.appendChild(temp);

      dailyDiv.appendChild(dayElem);
    }
  }

  // ---------- Отображение прогнозов ----------
  function displayWeatherForCoords(lat, lon, title = 'Текущее местоположение') {
    const card = createForecastCard(title, { removable: false });
    fetchWeatherData(lat, lon)
      .then(data => renderWeatherToCard(card, data))
      .catch(err => {
        console.error('fetchWeatherData error', err);
        showCardError(card, 'Ошибка загрузки данных');
      });
  }

  function displayWeatherForCityObj(cityObj, removable = false, idx = -1) {
    // cityObj: { name, lat, lon }
    const title = cityObj.name;
    const card = createForecastCard(title, { removable, index: idx });
    fetchWeatherData(cityObj.lat, cityObj.lon)
      .then(data => renderWeatherToCard(card, data))
      .catch(err => {
        console.error('fetchWeatherData error', err);
        showCardError(card, 'Ошибка загрузки данных');
      });
  }

  // ---------- Геолокация ----------
  function requestAndDisplayGeo() {
    if (!navigator.geolocation) {
      // Браузер не поддерживает геолокацию
      showCityForm();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        state.mainType = 'geo';
        saveState();
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        // очистим контейнер и отрисуем текущую локацию + остальные города
        clearWeatherCards();
        displayWeatherForCoords(lat, lon, 'Текущее местоположение');
        state.cities.forEach((c, i) => displayWeatherForCityObj(c, true, i));
      },
      error => {
        console.warn('Geolocation error', error);
        // Если пользователь отказал — показываем форму ввода города
        state.mainType = null;
        saveState();
        clearWeatherCards();
        showCityForm();
      },
      { enableHighAccuracy: false, timeout: 7000 }
    );
  }

  // ---------- Работа со списком городов (state.cities) ----------
  function addCityObjectToState(cityObj) {
    // Проверяем дубликаты по name (игнорируем регистр)
    const nameLower = cityObj.name.toLowerCase();
    if (state.mainType === 'city' && state.mainCity && state.mainCity.name.toLowerCase() === nameLower) {
      cityError.textContent = 'Город уже добавлен как главный';
      return false;
    }
    if (state.cities.some(c => c.name.toLowerCase() === nameLower)) {
      cityError.textContent = 'Город уже в списке';
      return false;
    }

    if (!state.mainType) {
      // если ещё нет основной локции — делаем этот город главным
      state.mainType = 'city';
      state.mainCity = cityObj;
    } else {
      // иначе добавляем в дополнительные города
      state.cities.push(cityObj);
    }
    saveState();
    return true;
  }

  function removeCity(index) {
    if (index < 0 || index >= state.cities.length) return;
    state.cities.splice(index, 1);
    saveState();
    refreshAll(); // перерисуем
  }

  // ---------- Обновление (Refresh) ----------
  function refreshAll() {
    clearWeatherCards();
    cityError.textContent = '';
    if (state.mainType === 'geo') {
      // повторно запрашиваем геолокацию (чтобы получить свежие координаты)
      requestAndDisplayGeo();
    } else if (state.mainType === 'city' && state.mainCity) {
      displayWeatherForCityObj(state.mainCity, false);
      state.cities.forEach((c, i) => displayWeatherForCityObj(c, true, i));
    } else {
      // нет сохранённой локации — пробуем запрашивать геолокацию
      requestAndDisplayGeo();
    }
  }

  // ---------- Автодополнение городов через OpenWeatherMap Geocoding API ----------
  // Функция возвращает массив предложений [{ name: "Город, Страна", lat, lon, rawName }]
  let suggestionsAbortController = null;
  function fetchCitySuggestions(query) {
    if (!query || query.length < 2) {
      return Promise.resolve([]);
    }
    // Отменим предыдущий запрос
    if (suggestionsAbortController) suggestionsAbortController.abort();
    suggestionsAbortController = new AbortController();

    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=6&appid=${API_KEY}`;
    return fetch(url, { signal: suggestionsAbortController.signal })
      .then(r => {
        if (!r.ok) throw new Error(`Ошибка подсказок ${r.status}`);
        return r.json();
      })
      .then(arr => {
        if (!Array.isArray(arr)) return [];
        return arr.map(item => {
          const parts = [item.name];
          if (item.state) parts.push(item.state);
          if (item.country) parts.push(item.country);
          const pretty = parts.join(', ');
          return {
            name: pretty,
            rawName: item.name,
            lat: item.lat,
            lon: item.lon
          };
        });
      })
      .catch(err => {
        if (err.name === 'AbortError') return [];
        console.warn('suggestions error', err);
        return [];
      });
  }

  // Рендер списка подсказок
  function showSuggestions(items) {
    suggestionsList.innerHTML = '';
    if (!items || items.length === 0) {
      suggestionsList.classList.remove('show');
      return;
    }
    items.forEach((it, idx) => {
      const li = document.createElement('li');
      li.textContent = it.name;
      li.setAttribute('role', 'option');
      li.addEventListener('click', () => {
        // при выборе подсказки — добавляем город
        cityInput.value = it.name;
        suggestionsList.classList.remove('show');
        cityError.textContent = '';
        handleSelectedSuggestion(it);
      });
      suggestionsList.appendChild(li);
    });
    suggestionsList.classList.add('show');
  }

  // Дебаунс для ввода
  let inputDebounceTimer = null;
  cityInput.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    cityError.textContent = '';
    if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
    if (!q) {
      suggestionsList.classList.remove('show');
      return;
    }
    inputDebounceTimer = setTimeout(() => {
      fetchCitySuggestions(q).then(items => showSuggestions(items));
    }, 300);
  });

  // Если пользователь нажал вне поля — скрыть подсказки
  document.addEventListener('click', (e) => {
    if (!cityForm.contains(e.target)) {
      suggestionsList.classList.remove('show');
    }
  });

  // ---------- Обработка выбора подсказки и сабмита формы ----------
  function handleSelectedSuggestion(item) {
    const cityObj = { name: item.name, lat: item.lat, lon: item.lon };
    const ok = addCityObjectToState(cityObj);
    if (ok) {
      // Перерисовываем прогнозы (новый город либо главный)
      refreshAll();
      cityInput.value = '';
    }
  }

  cityForm.addEventListener('submit', (e) => {
    e.preventDefault();
    cityError.textContent = '';
    const q = cityInput.value.trim();
    if (!q) {
      cityError.textContent = 'Введите название города';
      return;
    }

    // Если пользователь ввёл вручную название без выбора подсказки,
    // попытаемся получить координаты через геокодинг (limit=1)
    // и затем добавить город.
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${API_KEY}`;
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`Ошибка геокодинга ${r.status}`);
        return r.json();
      })
      .then(arr => {
        if (!arr || arr.length === 0) {
          cityError.textContent = 'Город не найден';
          return;
        }
        const item = arr[0];
        const parts = [item.name];
        if (item.state) parts.push(item.state);
        if (item.country) parts.push(item.country);
        const pretty = parts.join(', ');
        const cityObj = { name: pretty, lat: item.lat, lon: item.lon };
        const ok = addCityObjectToState(cityObj);
        if (ok) {
          refreshAll();
          cityInput.value = '';
        }
      })
      .catch(err => {
        console.error('geocode fetch error', err);
        cityError.textContent = 'Ошибка поиска города';
      });
  });

  // ---------- Порядок инициализации ----------
  function showCityForm() {
    // Показываем форму (в html она уже есть). Пользователь может добавить города вручную.
    // Очищаем карточки и, если есть сохранённые города — показываем их.
    clearWeatherCards();
    if (state.mainType === 'city' && state.mainCity) {
      displayWeatherForCityObj(state.mainCity, false);
    }
    state.cities.forEach((c, i) => displayWeatherForCityObj(c, true, i));
  }

  function init() {
    loadState();

    // Если есть сохранённые данные — восстановим их (но всё равно заново запросим прогнозы)
    if (state.mainType === 'geo') {
      // Попытаемся запросить геолокацию и показать "Текущее местоположение"
      requestAndDisplayGeo();
    } else if (state.mainType === 'city' && state.mainCity) {
      // Показываем главный город и дополнительные
      clearWeatherCards();
      displayWeatherForCityObj(state.mainCity, false);
      state.cities.forEach((c, i) => displayWeatherForCityObj(c, true, i));
    } else {
      // Нет сохранённых — запросим геолокацию (первый запуск)
      requestAndDisplayGeo();
    }
  }

  // ---------- Событие кнопки "Обновить" ----------
  refreshBtn.addEventListener('click', () => {
    refreshAll();
  });

  // Инициализация
  init();
});
