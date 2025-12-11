document.addEventListener('DOMContentLoaded', () => {
    const API_KEY = '6f3ef467e0d6b01caee679cf1ae44d9e';
    const weatherContainer = document.getElementById('weather-container');
    const refreshButton = document.getElementById('refresh');
    const cityForm = document.getElementById('city-form');
    const cityInput = document.getElementById('city-input');
    const cityError = document.getElementById('city-error');

    const STORAGE_KEY = 'weatherAppState';
    let state = {
        mainType: null,   // 'geo' or 'city'
        mainCity: null,
        cities: []
    };

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function loadState() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed) {
                    if (parsed.mainType) state.mainType = parsed.mainType;
                    if (parsed.mainCity) state.mainCity = parsed.mainCity;
                    if (parsed.cities) state.cities = parsed.cities;
                }
            } catch (e) {
                console.error('Error parsing saved state', e);
            }
        }
    }

    function createForecastCard(title) {
        const card = document.createElement('div');
        card.className = 'forecast-card';
        const heading = document.createElement('h2');
        heading.textContent = title;
        card.appendChild(heading);

        const dailyDiv = document.createElement('div');
        dailyDiv.className = 'daily-forecast';
        const loadingText = document.createElement('p');
        loadingText.className = 'loading';
        loadingText.textContent = 'Загрузка...';
        dailyDiv.appendChild(loadingText);

        card.appendChild(dailyDiv);
        weatherContainer.appendChild(card);
        return card;
    }

    function fetchWeather(lat, lon, card) {
        const dailyDiv = card.querySelector('.daily-forecast');

        fetch(`https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,alerts&units=metric&lang=ru&appid=${API_KEY}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                dailyDiv.innerHTML = '';
                const labels = ['Сегодня', 'Завтра', 'Послезавтра'];

                for (let i = 0; i < 3; i++) {
                    if (!data.daily[i]) break;
                    const dayData = data.daily[i];

                    const dayElem = document.createElement('div');
                    dayElem.className = 'day';

                    const dateP = document.createElement('p');
                    dateP.className = 'date';
                    dateP.textContent = labels[i];
                    dayElem.appendChild(dateP);

                    const iconImg = document.createElement('img');
                    iconImg.className = 'icon';
                    const iconCode = dayData.weather[0].icon;
                    iconImg.src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
                    iconImg.alt = dayData.weather[0].description;
                    dayElem.appendChild(iconImg);

                    const descP = document.createElement('p');
                    descP.className = 'desc';
                    descP.textContent = dayData.weather[0].description;
                    dayElem.appendChild(descP);

                    const tempP = document.createElement('p');
                    tempP.className = 'temp';
                    const max = Math.round(dayData.temp.max);
                    const min = Math.round(dayData.temp.min);
                    tempP.textContent = `${min > 0 ? '+' + min : min}°C / ${max > 0 ? '+' + max : max}°C`;
                    dayElem.appendChild(tempP);

                    dailyDiv.appendChild(dayElem);
                }
            })
            .catch(error => {
                console.error('Error fetching weather:', error);
                dailyDiv.innerHTML = '';
                const errP = document.createElement('p');
                errP.className = 'error';
                errP.textContent = 'Ошибка загрузки данных';
                dailyDiv.appendChild(errP);
            });
    }

    function displayWeatherForCity(cityName) {
        const title = cityName;

        fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cityName)}&limit=1&appid=${API_KEY}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Geocoding network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                if (!data || data.length === 0) {
                    throw new Error('City not found');
                }
                const loc = data[0];
                const lat = loc.lat;
                const lon = loc.lon;
                const card = createForecastCard(title);
                fetchWeather(lat, lon, card);
            })
            .catch(error => {
                console.error('Error fetching city coordinates:', error);
                cityError.textContent = 'Город не найден';
            });
    }

    function displayWeatherForCurrentLocation() {
        navigator.geolocation.getCurrentPosition(
            position => {
                state.mainType = 'geo';
                saveState();

                const lat = position.coords.latitude;
                const lon = position.coords.longitude;

                const card = createForecastCard('Текущее местоположение');
                fetchWeather(lat, lon, card);
            },
            error => {
                console.error('Geolocation error:', error);
            }
        );
    }

    cityForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const cityName = cityInput.value.trim();
        cityError.textContent = '';

        if (!cityName) {
            cityError.textContent = 'Введите название города';
            return;
        }

        const nameLower = cityName.toLowerCase();
        if (state.mainType === 'city' && state.mainCity && state.mainCity.toLowerCase() === nameLower) {
            cityError.textContent = 'Город уже добавлен';
            cityInput.value = '';
            return;
        }
        if (state.cities.some(c => c.toLowerCase() === nameLower)) {
            cityError.textContent = 'Город уже добавлен';
            cityInput.value = '';
            return;
        }

        if (!state.mainType) {
            state.mainType = 'city';
            state.mainCity = cityName;
            state.cities = [];
            saveState();
            displayWeatherForCity(cityName);
        } else {
            state.cities.push(cityName);
            saveState();
            displayWeatherForCity(cityName);
        }

        cityInput.value = '';
    });

    refreshButton.addEventListener('click', () => {
        weatherContainer.innerHTML = '';

        if (state.mainType === 'geo') {
            displayWeatherForCurrentLocation();
        } else if (state.mainType === 'city') {
            if (state.mainCity) {
                displayWeatherForCity(state.mainCity);
            }
        }
        state.cities.forEach(cityName => {
            displayWeatherForCity(cityName);
        });
    });

    function init() {
        loadState();

        if (state.mainType === 'city' && state.mainCity) {
            displayWeatherForCity(state.mainCity);
        } else {
            if (!state.mainType) {
                displayWeatherForCurrentLocation();
            } else if (state.mainType === 'geo') {
                displayWeatherForCurrentLocation();
            }
        }

        state.cities.forEach(cityName => {
            displayWeatherForCity(cityName);
        });
    }

    init();
});
