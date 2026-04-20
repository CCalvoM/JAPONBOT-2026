const TelegramBot = require('node-telegram-bot-api');
const { getUpcomingEvents, addEvent, getAllEvents } = require('./calendar');
const { askAI } = require('./ai');
const { getWeather } = require('./weather');
const { scheduleDaily } = require('./scheduler');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Store registered users: { telegramId: { name, username } }
const registeredUsers = {};

// Store conversation history per chat
const conversationHistory = {};

console.log('🇯🇵 Bot Japón 2026 arrancado!');

// /start — registro automático
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const name = msg.from.first_name || msg.from.username || 'Viajero';

  registeredUsers[userId] = {
    name,
    username: msg.from.username,
    telegramId: userId,
  };

  await bot.sendMessage(chatId,
    `🇯🇵 ¡Bienvenido al viaje a Japón 2026, ${name}!\n\n` +
    `Ya estás registrado. Escribe /ayuda para ver todo lo que puedo hacer.`
  );
});

// /ayuda
bot.onText(/\/ayuda/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId,
    `🤖 *Lo que puedo hacer:*\n\n` +
    `📅 *Calendario*\n` +
    `/hoy — actividades de hoy\n` +
    `/mañana — actividades de mañana\n` +
    `/semana — toda la semana\n` +
    `/itinerario — itinerario completo\n\n` +
    `➕ *Añadir actividad*\n` +
    `/añadir — te guío paso a paso\n\n` +
    `🌤️ *Tiempo*\n` +
    `/tiempo — meteorología en la ciudad actual\n\n` +
    `🧠 *IA*\n` +
    `Simplemente escríbeme cualquier cosa:\n` +
    `• "¿Qué hacemos mañana si llueve?"\n` +
    `• "¿Merece la pena madrugar para Senso-ji?"\n` +
    `• "Tenemos hueco el jueves, ¿qué nos recomiendas?"\n\n` +
    `💡 Estoy aquí para ayudaros a organizar el mejor viaje de vuestra vida 🚀`,
    { parse_mode: 'Markdown' }
  );
});

// /hoy
bot.onText(/\/hoy/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '⏳ Consultando el calendario...');
  try {
    const events = await getUpcomingEvents(1);
    if (!events.length) {
      await bot.sendMessage(chatId, '📅 No hay actividades programadas para hoy.');
    } else {
      const text = formatEvents(events, 'Hoy');
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    }
  } catch (e) {
    await bot.sendMessage(chatId, '❌ Error consultando el calendario: ' + e.message);
  }
});

// /mañana
bot.onText(/\/ma[ñn]ana/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '⏳ Consultando el calendario...');
  try {
    const events = await getUpcomingEvents(2);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowEvents = events.filter(e => {
      const d = new Date(e.start);
      return d.toDateString() === tomorrow.toDateString();
    });
    if (!tomorrowEvents.length) {
      await bot.sendMessage(chatId, '📅 No hay actividades programadas para mañana.');
    } else {
      const text = formatEvents(tomorrowEvents, 'Mañana');
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    }
  } catch (e) {
    await bot.sendMessage(chatId, '❌ Error: ' + e.message);
  }
});

// /semana
bot.onText(/\/semana/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '⏳ Cargando la semana...');
  try {
    const events = await getUpcomingEvents(7);
    if (!events.length) {
      await bot.sendMessage(chatId, '📅 No hay actividades esta semana.');
    } else {
      const text = formatEvents(events, 'Esta semana');
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    }
  } catch (e) {
    await bot.sendMessage(chatId, '❌ Error: ' + e.message);
  }
});

// /itinerario
bot.onText(/\/itinerario/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '⏳ Cargando itinerario completo...');
  try {
    const events = await getAllEvents();
    if (!events.length) {
      await bot.sendMessage(chatId, '📅 El itinerario está vacío. ¡Empezad a añadir actividades!');
    } else {
      const text = formatEvents(events, 'Itinerario completo 🇯🇵');
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    }
  } catch (e) {
    await bot.sendMessage(chatId, '❌ Error: ' + e.message);
  }
});

// /tiempo
bot.onText(/\/tiempo/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '⏳ Consultando el tiempo...');
  try {
    const weather = await getWeather();
    await bot.sendMessage(chatId, weather, { parse_mode: 'Markdown' });
  } catch (e) {
    await bot.sendMessage(chatId, '❌ Error consultando el tiempo: ' + e.message);
  }
});

// /añadir — flujo guiado
const addEventState = {};

bot.onText(/\/a[ñn]adir/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  addEventState[userId] = { step: 'nombre', chatId };
  await bot.sendMessage(chatId,
    `➕ Vamos a añadir una actividad.\n\n¿Cómo se llama la actividad?`
  );
});

// Manejo del flujo de añadir + IA para todo lo demás
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  // Flujo añadir evento
  if (addEventState[userId]) {
    const state = addEventState[userId];

    if (state.step === 'nombre') {
      state.nombre = text;
      state.step = 'fecha';
      await bot.sendMessage(chatId,
        `📅 ¿Cuándo es? Escríbelo así:\n*DD/MM/YYYY HH:MM*\nEjemplo: 25/08/2026 10:00`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (state.step === 'fecha') {
      const parsed = parseDateTime(text);
      if (!parsed) {
        await bot.sendMessage(chatId, '❌ Formato incorrecto. Usa DD/MM/YYYY HH:MM, por ejemplo: 25/08/2026 10:00');
        return;
      }
      state.fecha = parsed;
      state.step = 'descripcion';
      await bot.sendMessage(chatId, `📝 ¿Alguna descripción? (dirección, precio, notas...) O escribe *saltar* para dejarlo vacío.`, { parse_mode: 'Markdown' });
      return;
    }

    if (state.step === 'descripcion') {
      state.descripcion = text.toLowerCase() === 'saltar' ? '' : text;
      const name = registeredUsers[userId]?.name || msg.from.first_name || 'Alguien';

      try {
        await addEvent({
          summary: `${state.nombre} (org: ${name})`,
          description: state.descripcion,
          start: state.fecha,
          end: new Date(state.fecha.getTime() + 2 * 60 * 60 * 1000), // +2h por defecto
        });
        delete addEventState[userId];
        await bot.sendMessage(chatId,
          `✅ *${state.nombre}* añadido al calendario!\n📅 ${formatDate(state.fecha)}\n👤 Organiza: ${name}`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        delete addEventState[userId];
        await bot.sendMessage(chatId, '❌ Error añadiendo al calendario: ' + e.message);
      }
      return;
    }
  }

  // IA para todo lo demás
  try {
    const userName = registeredUsers[userId]?.name || msg.from.first_name || 'un viajero';

    if (!conversationHistory[chatId]) conversationHistory[chatId] = [];
    conversationHistory[chatId].push({ role: 'user', content: `${userName}: ${text}` });

    // Mantener solo últimos 20 mensajes
    if (conversationHistory[chatId].length > 20) {
      conversationHistory[chatId] = conversationHistory[chatId].slice(-20);
    }

    await bot.sendChatAction(chatId, 'typing');

    const events = await getAllEvents().catch(() => []);
    const weather = await getWeather().catch(() => 'No disponible');

    const response = await askAI(conversationHistory[chatId], events, weather, userName);

    conversationHistory[chatId].push({ role: 'assistant', content: response });

    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (e) {
    await bot.sendMessage(chatId, '❌ Error procesando tu mensaje: ' + e.message);
  }
});

// Helpers
function formatEvents(events, title) {
  let text = `📅 *${title}*\n\n`;
  const byDay = {};

  events.forEach(e => {
    const d = new Date(e.start);
    const key = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Tokyo' });
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(e);
  });

  for (const [day, dayEvents] of Object.entries(byDay)) {
    text += `*${day.charAt(0).toUpperCase() + day.slice(1)}*\n`;
    dayEvents.forEach(e => {
      const time = new Date(e.start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
      text += `  🕐 ${time} — ${e.summary}\n`;
      if (e.description) text += `  📝 ${e.description}\n`;
    });
    text += '\n';
  }

  return text;
}

function formatDate(date) {
  return date.toLocaleString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo'
  });
}

function parseDateTime(text) {
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const [, d, m, y, h, min] = match;
  return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${h.padStart(2,'0')}:${min}:00+09:00`);
}

// Exportar bot y usuarios para el scheduler
module.exports = { bot, registeredUsers };
scheduleDaily(bot, registeredUsers);
