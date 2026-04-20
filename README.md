# 🇯🇵 Bot Japón 2026

Bot de Telegram inteligente para organizar el viaje a Japón del 21 Agosto al 5 Septiembre 2026.

## Comandos disponibles

| Comando | Descripción |
|---------|-------------|
| `/start` | Registrarse en el bot |
| `/ayuda` | Ver todos los comandos |
| `/hoy` | Actividades de hoy |
| `/mañana` | Actividades de mañana |
| `/semana` | Actividades de esta semana |
| `/itinerario` | Itinerario completo del viaje |
| `/añadir` | Añadir una actividad al calendario |
| `/tiempo` | Ver el tiempo en la ciudad actual |
| _(cualquier texto)_ | IA responde con consejos y recomendaciones |

## Setup en Railway

### 1. Variables de entorno en Railway

En tu proyecto de Railway → Variables, añade:

```
TELEGRAM_TOKEN=<tu token de BotFather>
GOOGLE_CALENDAR_ID=<id del calendario>
GOOGLE_CREDENTIALS_JSON=<contenido del JSON en una sola línea>
OPENAI_API_KEY=<tu api key de openai>
OPENWEATHER_API_KEY=<tu api key de openweather>
```

> ⚠️ Para GOOGLE_CREDENTIALS_JSON: abre el archivo .json, selecciona todo el contenido y pégalo en una sola línea en Railway.

### 2. OpenWeather API Key (gratis)
1. Ve a https://openweathermap.org/api
2. Regístrate gratis
3. Ve a "My API Keys" y copia tu key

### 3. Desplegar
1. Sube este código a un repo de GitHub
2. En Railway → New Project → Deploy from GitHub
3. Selecciona el repo
4. Añade las variables de entorno
5. Deploy automático ✅

## Funcionalidades

- 📅 **Calendario compartido**: lee y escribe en Google Calendar
- 🌤️ **Tiempo en tiempo real**: OpenWeather API, ciudad según la fase del viaje
- 🤖 **IA con contexto**: GPT-4o conoce todo el itinerario y da recomendaciones inteligentes
- ⏰ **Briefing matutino**: mensaje automático a las 8:00h hora Japón
- 🔔 **Recordatorios**: aviso 1h antes de cada actividad
- 👥 **Multi-usuario**: cada persona se registra con /start, el bot aprende sus nombres
