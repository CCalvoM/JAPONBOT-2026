const https = require('https');

// Cities during the trip
const CITIES = [
  { name: 'Osaka', lat: 34.6937, lon: 135.5023 },
  { name: 'Kyoto', lat: 35.0116, lon: 135.7681 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
];

// Determine current city based on trip dates
function getCurrentCity() {
  const now = new Date();
  const aug21 = new Date('2026-08-21');
  const aug25 = new Date('2026-08-25');
  const aug29 = new Date('2026-08-29');
  const sep5 = new Date('2026-09-05');

  if (now >= aug21 && now < aug25) return CITIES[0]; // Osaka
  if (now >= aug25 && now < aug29) return CITIES[1]; // Kyoto
  if (now >= aug29 && now <= sep5) return CITIES[2]; // Tokyo

  // Outside trip dates — default to Tokyo
  return CITIES[2];
}

function fetchWeather(city) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      resolve('API key de OpenWeather no configurada.');
      return;
    }

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${city.lat}&lon=${city.lon}&appid=${apiKey}&units=metric&lang=es&cnt=8`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.cod !== '200') {
            resolve(`No se pudo obtener el tiempo para ${city.name}.`);
            return;
          }

          const items = json.list.slice(0, 4);
          let text = `🌤️ *Tiempo en ${city.name}*\n\n`;

          items.forEach(item => {
            const date = new Date(item.dt * 1000);
            const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
            const temp = Math.round(item.main.temp);
            const feels = Math.round(item.main.feels_like);
            const desc = item.weather[0].description;
            const rain = item.pop > 0.3 ? `🌧️ ${Math.round(item.pop * 100)}% lluvia` : '';
            const emoji = getWeatherEmoji(item.weather[0].id);

            text += `${emoji} *${time}h* — ${temp}°C (sensación ${feels}°C)\n`;
            text += `  ${desc.charAt(0).toUpperCase() + desc.slice(1)} ${rain}\n\n`;
          });

          // Advice based on weather
          const hasRain = items.some(i => i.pop > 0.5);
          if (hasRain) {
            text += `⚠️ _Hay probabilidad de lluvia — tened un paraguas a mano y considerad actividades de interior._`;
          } else {
            text += `✅ _Buen tiempo en general para el plan de hoy._`;
          }

          resolve(text);
        } catch (e) {
          resolve('Error procesando datos del tiempo.');
        }
      });
    }).on('error', () => resolve('No se pudo conectar con OpenWeather.'));
  });
}

function getWeatherEmoji(id) {
  if (id >= 200 && id < 300) return '⛈️';
  if (id >= 300 && id < 400) return '🌦️';
  if (id >= 500 && id < 600) return '🌧️';
  if (id >= 600 && id < 700) return '❄️';
  if (id >= 700 && id < 800) return '🌫️';
  if (id === 800) return '☀️';
  if (id === 801) return '🌤️';
  if (id <= 804) return '☁️';
  return '🌡️';
}

async function getWeather() {
  const city = getCurrentCity();
  return fetchWeather(city);
}

module.exports = { getWeather };
