(() => {
  class ApiClient {
    constructor() {
      this.BASE = {
        GEOCODE_SEARCH: 'https://geocoding-api.open-meteo.com/v1/search',
        GEOCODE_REVERSE: 'https://geocoding-api.open-meteo.com/v1/reverse',
        FORECAST: 'https://api.open-meteo.com/v1/forecast'
      };
    }

    async geocodeSuggest(q, count = 8) {
      const url = `${this.BASE.GEOCODE_SEARCH}?name=${encodeURIComponent(q)}&count=${count}&language=ru&format=json`;
      const r = await fetch(url);
      if (!r.ok) throw new Error('Ошибка подсказок геокода');
      return r.json();
    }

    async geocodeByCoords(lat, lon) {
      const url = `${this.BASE.GEOCODE_REVERSE}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&count=1&language=ru`;
      const r = await fetch(url);
      if (!r.ok) return null;
      return r.json();
    }

    async forecast(lat, lon, days = 3) {
      const url = `${this.BASE.FORECAST}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days=${days}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error('Ошибка получения прогноза');
      return r.json();
    }
  }

  class StorageHelper {
    static safeParse(raw, fallback) {
      try {
        if (raw === null || typeof raw === 'undefined') return fallback;
        const p = JSON.parse(raw);
        return p === null ? fallback : p;
      } catch (e) {
        return fallback;
      }
    }
    static get(key, fallback) {
      try {
        return StorageHelper.safeParse(localStorage.getItem(key), fallback);
      } catch (e) { return fallback; }
    }
    static set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); }
      catch (e) { console.warn('localStorage:set error', e); }
    }
  }

  const uid = (n = 8) => Math.random().toString(36).slice(2, 2 + n);
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
  const debounce = (fn, ms = 250) => {
    let t = null;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };
  const monthNames = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  const humanDate = (iso) => {
    try {
      const d = new Date(iso);
      if (isNaN(d)) return String(iso);
      return `${d.getDate()} ${monthNames[d.getMonth()]}`;
    } catch { return String(iso); }
  };

  const WEATHER_MAP = {
    0: "Ясно",1: "Частично облачно",2: "Облачно",3: "Пасмурно",
    45: "Туман",48: "Туман с инеем",
    51: "Мелкий дождь",53: "Умеренный дождь",55: "Сильный дождь",
    61: "Дождь",63: "Сильный дождь",65: "Сильный дождь",
    71: "Снег",73: "Сильный снег",75: "Очень сильный снег",
    80: "Ливень",81: "Сильный ливень",82: "Очень сильный ливень",
    95: "Гроза",96: "Гроза с небольшим градом",99: "Гроза с градом"
  };

  class WeatherManager {
    constructor() {
      this.api = new ApiClient();
      this.storeKey = 'weather_app:places_v2';
      this.places = StorageHelper.get(this.storeKey, []) || []; // [{id,name,displayName,lat,lon,isGeo}]
      this.suggestCache = new Map(); 
      this.pick = null; 
      this.nodes = {
        grid: document.getElementById('grid'),
        search: document.getElementById('city-search'),
        suggestions: document.getElementById('city-suggestions'),
        addBtn: document.getElementById('btn-add'),
        geoBtn: document.getElementById('btn-geo'),
        refreshBtn: document.getElementById('btn-refresh'),
        err: document.getElementById('input-error'),
        locationLabel: document.getElementById('locationLabel')
      };

      this._bind();
      if (this.places.length === 0 && 'geolocation' in navigator) {
        this._trySetGeo(false).finally(() => this.renderAll());
      } else {
        this.renderAll();
      }
    }

    _bind() {
      if (this.nodes.search) {
        this.nodes.search.addEventListener('input', debounce((e) => this._onSearch(e), 260));
        this.nodes.search.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); this.addFromInput(); }
          if (ev.key === 'Escape') { this._hideSuggestions(); }
        });
      }
      if (this.nodes.suggestions) {
        this.nodes.suggestions.addEventListener('click', (e) => {
          const li = e.target.closest('li'); if (!li) return;
          this.pick = {
            name: li.dataset.name || li.textContent.trim(),
            display: li.dataset.display || li.textContent.trim(),
            lat: parseFloat(li.dataset.lat),
            lon: parseFloat(li.dataset.lon)
          };
          if (this.nodes.search) this.nodes.search.value = this.pick.display;
          this._hideSuggestions();
        });
      }
      document.addEventListener('click', (e) => {
        if (!this.nodes.search.contains(e.target) && !this.nodes.suggestions.contains(e.target)) this._hideSuggestions();
      });
      if (this.nodes.addBtn) this.nodes.addBtn.addEventListener('click', () => this.addFromInput());
      if (this.nodes.geoBtn) this.nodes.geoBtn.addEventListener('click', () => this._trySetGeo(true));
      if (this.nodes.refreshBtn) this.nodes.refreshBtn.addEventListener('click', () => this.refreshAll());
    }

    async _onSearch() {
      const q = (this.nodes.search && this.nodes.search.value || '').trim();
      this.pick = null;
      if (this.nodes.err) this.nodes.err.textContent = '';
      if (!q) { this._hideSuggestions(); return; }
      if (this.suggestCache.has(q)) { this._renderSuggestions(this.suggestCache.get(q)); return; }
      try {
        const res = await this.api.geocodeSuggest(q, 8);
        const list = (res && res.results) ? res.results : [];
        this.suggestCache.set(q, list);
        this._renderSuggestions(list);
      } catch (err) {
        console.warn('suggest error', err);
        this._hideSuggestions();
      }
    }

    _renderSuggestions(list) {
      if (!this.nodes.suggestions) return;
      if (!list || list.length === 0) { this._hideSuggestions(); return; }
      this.nodes.suggestions.innerHTML = list.map(r => {
        const disp = `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}${r.country ? ', ' + r.country : ''}`;
        return `<li data-lat="${r.latitude}" data-lon="${r.longitude}" data-display="${escapeHtml(disp)}" data-name="${escapeHtml(r.name)}">${escapeHtml(disp)}</li>`;
      }).join('');
      this.nodes.suggestions.classList.add('show');
    }

    _hideSuggestions() {
      if (!this.nodes.suggestions) return;
      this.nodes.suggestions.classList.remove('show');
      this.nodes.suggestions.innerHTML = '';
    }

    async addFromInput() {
      const raw = (this.nodes.search && this.nodes.search.value || '').trim();
      if (this.nodes.err) this.nodes.err.textContent = '';
      if (!raw) { if (this.nodes.err) this.nodes.err.textContent = 'Введите название города'; return; }

      try {
        if (this.pick && this.pick.display === raw) {
          const p = this.pick;
          if (this._isDupCoords(p.lat, p.lon)) { if (this.nodes.err) this.nodes.err.textContent = 'Этот город уже добавлен.'; return; }
          this.places.push({ id: uid(), name: p.name, displayName: p.display, lat: p.lat, lon: p.lon, isGeo: false });
          StorageHelper.set(this.storeKey, this.places);
          this.nodes.search.value = '';
          this.pick = null;
          this.renderAll();
          return;
        }

        if (this.nodes.err) this.nodes.err.textContent = 'Проверка...';
        const resp = await this.api.geocodeSuggest(raw, 5);
        if (!resp || !resp.results || resp.results.length === 0) {
          if (this.nodes.err) this.nodes.err.textContent = 'Город не найден.'; return;
        }
        const best = resp.results[0];
        if (this._isDupCoords(best.latitude, best.longitude)) { if (this.nodes.err) this.nodes.err.textContent = 'Этот город уже добавлен.'; return; }
        const disp = `${best.name}${best.admin1 ? ', ' + best.admin1 : ''}${best.country ? ', ' + best.country : ''}`;
        this.places.push({ id: uid(), name: best.name, displayName: disp, lat: best.latitude, lon: best.longitude, isGeo: false });
        StorageHelper.set(this.storeKey, this.places);
        this.nodes.search.value = '';
        if (this.nodes.err) this.nodes.err.textContent = '';
        this.renderAll();
      } catch (err) {
        console.error('addFromInput', err);
        if (this.nodes.err) this.nodes.err.textContent = 'Ошибка сети';
      }
    }

    _isDupCoords(lat, lon) {
      if (!Array.isArray(this.places)) return false;
      return this.places.some(p => Math.abs((p.lat || 0) - (lat || 0)) < 1e-6 && Math.abs((p.lon || 0) - (lon || 0)) < 1e-6);
    }

    async _trySetGeo(showErrors = true) {
      if (!('geolocation' in navigator)) { if (showErrors && this.nodes.err) this.nodes.err.textContent = 'Геолокация не поддерживается'; return; }

      const getPos = (opts = {}) => new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, opts));
      try {
        const pos = await getPos({ timeout: 10000 });
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        let display = 'Текущее местоположение';
        try {
          const rev = await this.api.geocodeByCoords(lat, lon);
          if (rev && rev.results && rev.results[0]) {
            const r = rev.results[0];
            display = `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}${r.country ? ', ' + r.country : ''}`;
          }
        } catch (e) { }

        const existingGeo = this.places.find(p => p.isGeo);
        if (existingGeo) {
          existingGeo.lat = lat; existingGeo.lon = lon; existingGeo.displayName = display;
        } else {
          this.places.unshift({ id: uid(), name: 'geo', displayName: display, lat, lon, isGeo: true });
        }
        StorageHelper.set(this.storeKey, this.places);
        this.renderAll();
        if (this.nodes.err) this.nodes.err.textContent = '';
      } catch (err) {
        if (!showErrors) return;
        console.warn('geo error', err);
        if (err && err.code === 1 && this.nodes.err) this.nodes.err.textContent = 'Доступ к геопозиции запрещён';
        else if (this.nodes.err) this.nodes.err.textContent = 'Не удалось получить геопозицию';
      }
    }

    _makeCard(place) {
      const card = document.createElement('article');
      card.className = 'card';
      card.dataset.id = place.id;
      card.innerHTML = `
        <div class="card-head">
          <div>
            <div class="city-name">${escapeHtml(place.displayName || place.name)}</div>
            <div class="city-type">${place.isGeo ? 'Текущее местоположение' : 'Город'}</div>
          </div>
          <div class="card-actions">
            <button class="btn-mini remove">Удалить</button>
          </div>
        </div>
        <div class="card-body"><div class="loading">Загрузка...</div></div>
      `;

      const btn = card.querySelector('.remove');
      btn.addEventListener('click', () => {
        const wasGeo = this.places.find(p => p.id === place.id && p.isGeo);
        this.places = this.places.filter(p => p.id !== place.id);
        StorageHelper.set(this.storeKey, this.places);
        this.renderAll();
        if (wasGeo) this._updateLocationLabel();
      });

      return card;
    }

    async _fillForecastIntoCard(place, card) {
      const body = card.querySelector('.card-body');
      if (!body) return;
      body.innerHTML = `<div class="loading">Загрузка...</div>`;
      try {
        let { lat, lon } = place;
        if ((!lat || !lon) && !place.isGeo) {
          const resp = await this.api.geocodeSuggest(place.name, 1);
          if (!resp || !resp.results || resp.results.length === 0) {
            body.innerHTML = `<div class="forecast-error">Город не найден.</div>`; return;
          }
          const g = resp.results[0];
          lat = g.latitude; lon = g.longitude;
          place.lat = lat; place.lon = lon;
          StorageHelper.set(this.storeKey, this.places);
        }
        const fx = await this.api.forecast(lat, lon, 3);
        const times = (fx.daily && fx.daily.time) ? fx.daily.time : [];
        const tmin = (fx.daily && fx.daily.temperature_2m_min) ? fx.daily.temperature_2m_min : [];
        const tmax = (fx.daily && fx.daily.temperature_2m_max) ? fx.daily.temperature_2m_max : [];
        const codes = (fx.daily && fx.daily.weathercode) ? fx.daily.weathercode : [];

        let html = '';
        for (let i = 0; i < 3; i++) {
          const label = (i === 0 ? 'Сегодня' : i === 1 ? 'Завтра' : 'Послезавтра');
          const tv = times[i] || '';
          const minV = (typeof tmin[i] !== 'undefined') ? Math.round(tmin[i]) : '—';
          const maxV = (typeof tmax[i] !== 'undefined') ? Math.round(tmax[i]) : '—';
          const txt = (typeof codes[i] !== 'undefined' && WEATHER_MAP[codes[i]]) ? WEATHER_MAP[codes[i]] : '—';
          html += `<div class="day-row"><div class="left"><div class="day-label">${label}${tv ? ` (${humanDate(tv)})` : ''}</div><div class="day-desc">${escapeHtml(txt)}</div></div><div class="temps">${minV}°C — ${maxV}°C</div></div>`;
        }
        body.innerHTML = html;
      } catch (err) {
        console.error('fill forecast', err);
        body.innerHTML = `<div class="forecast-error">Ошибка загрузки: ${escapeHtml(err.message || 'ошибка')}</div>`;
      }
    }

    renderAll() {
      if (!this.nodes.grid) return;
      this.nodes.grid.innerHTML = '';

      if (!Array.isArray(this.places) || this.places.length === 0) {
        this.nodes.grid.innerHTML = `<div class="loading">Нет сохранённых городов. Разрешите геопозицию или добавьте город вручную.</div>`;
        this._updateLocationLabel();
        return;
      }

      for (const place of this.places) {
        const card = this._makeCard(place);
        this.nodes.grid.appendChild(card);
        this._fillForecastIntoCard(place, card);
      }
      this._updateLocationLabel();
    }

    _updateLocationLabel() {
      const geo = Array.isArray(this.places) ? this.places.find(p => p.isGeo) : null;
      if (!this.nodes.locationLabel) return;
      if (geo) this.nodes.locationLabel.textContent = `Местоположение: ${geo.displayName || 'Текущее местоположение'}`;
      else this.nodes.locationLabel.textContent = '';
    }

    async refreshAll() {
      const cards = Array.from(document.querySelectorAll('.card'));
      for (const card of cards) {
        const id = card.dataset.id;
        const place = this.places.find(p => p.id === id);
        if (place) {
          await this._fillForecastIntoCard(place, card);
        }
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.__WeatherApp = new WeatherManager();
  });

})();
