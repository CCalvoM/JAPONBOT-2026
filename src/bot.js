const TelegramBot = require('node-telegram-bot-api');
const { getUpcomingEvents, addEvent, getAllEvents } = require('./calendar');
const { askAI, parseEventFromText } = require('./ai');
const { getWeather } = require('./weather');
const { scheduleDaily } = require('./scheduler');

const token = process.env.TELEGRAM_TOKEN;
console.log('TOKEN CHECK:', token ? `OK (empieza por ${token.substring(0,10)}...)` : 'UNDEFINED');
const bot = new TelegramBot(token, { polling: true });

const registeredUsers = {};
const conversationHistory = {};
const lastProposal = {};
const addEventState = {};

console.log('🇯🇵 Bot Japón 2026 arrancado!');

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const name = msg.from.first_name || msg.from.username || 'Viajero';
  registeredUsers[userId] = { name, username: msg.from.username, telegramId: userId, chatId };
  await bot.sendMessage(chatId, `🇯🇵 ¡Bienvenido al viaje a Japón 2026, ${name}!\n\nYa estás registrado. Escribe /ayuda para ver todo lo que puedo hacer.`);
});

bot.onText(/\/ayuda/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `🤖 *Lo que puedo hacer:*\n\n` +
    `📅 *Calendario*\n/hoy /mañana /semana /itinerario\n\n` +
    `➕ *Añadir actividad*\n` +
    `/añadir — flujo paso a paso\n` +
    `_"añade visita al Castillo el 25 a las 10"_ — lenguaje natural\n` +
    `_"sí/ponlo/dale"_ — confirmar lo que te proponga\n\n` +
    `🌤️ /tiempo — meteorología actual\n\n` +
    `🧠 *IA* — escríbeme cualquier cosa sobre el viaje`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/hoy/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const events = await getUpcomingEvents(1);
    await bot.sendMessage(chatId, events.length ? formatEvents(events, 'Hoy') : '📅 No hay actividades hoy.', { parse_mode: 'Markdown' });
  } catch (e) { await bot.sendMessage(chatId, '❌ Error: ' + e.message); }
});

bot.onText(/\/ma[ñn]ana/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const events = await getUpcomingEvents(2);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const filtered = events.filter(e => new Date(e.start).toDateString() === tomorrow.toDateString());
    await bot.sendMessage(chatId, filtered.length ? formatEvents(filtered, 'Mañana') : '📅 No hay actividades mañana.', { parse_mode: 'Markdown' });
  } catch (e) { await bot.sendMessage(chatId, '❌ Error: ' + e.message); }
});

bot.onText(/\/semana/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const events = await getUpcomingEvents(7);
    await bot.sendMessage(chatId, events.length ? formatEvents(events, 'Esta semana') : '📅 No hay actividades esta semana.', { parse_mode: 'Markdown' });
  } catch (e) { await bot.sendMessage(chatId, '❌ Error: ' + e.message); }
});

bot.onText(/\/itinerario/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const events = await getAllEvents();
    await bot.sendMessage(chatId, events.length ? formatEvents(events, 'Itinerario completo 🇯🇵') : '📅 El itinerario está vacío.', { parse_mode: 'Markdown' });
  } catch (e) { await bot.sendMessage(chatId, '❌ Error: ' + e.message); }
});

bot.onText(/\/tiempo/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await bot.sendMessage(chatId, await getWeather(), { parse_mode: 'Markdown' });
  } catch (e) { await bot.sendMessage(chatId, '❌ Error: ' + e.message); }
});

bot.onText(/\/a[ñn]adir/, async (msg) => {
  const userId = msg.from.id;
  addEventState[userId] = { step: 'nombre', chatId: msg.chat.id };
  await bot.sendMessage(msg.chat.id, `➕ Vamos a añadir una actividad.\n\n¿Cómo se llama?`);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;

  const userName = registeredUsers[userId]?.name || msg.from.first_name || 'un viajero';

  // 1. Flujo guiado
  if (addEventState[userId]) {
    await handleAddFlow(chatId, userId, text, userName);
    return;
  }

  // 2. Confirmación de propuesta anterior
  if (isConfirmation(text) && lastProposal[chatId]) {
    await handleConfirmation(chatId, userName);
    return;
  }

  // 3. Intención natural de añadir
  if (isAddIntent(text)) {
    await handleNaturalAdd(chatId, userId, text, userName);
    return;
  }

  // 4. IA general
  await handleAI(chatId, text, userName);
});

async function handleAddFlow(chatId, userId, text, userName) {
  const state = addEventState[userId];
  if (state.step === 'nombre') {
    state.nombre = text; state.step = 'fecha';
    await bot.sendMessage(chatId, `📅 ¿Cuándo es?\nFormato: *DD/MM/YYYY HH:MM*\nEjemplo: 25/08/2026 10:00`, { parse_mode: 'Markdown' });
  } else if (state.step === 'fecha') {
    const parsed = parseDateTime(text);
    if (!parsed) { await bot.sendMessage(chatId, '❌ Formato incorrecto. Usa DD/MM/YYYY HH:MM'); return; }
    state.fecha = parsed; state.step = 'descripcion';
    await bot.sendMessage(chatId, `📝 ¿Descripción? (dirección, precio...) O escribe *saltar*.`, { parse_mode: 'Markdown' });
  } else if (state.step === 'descripcion') {
    state.descripcion = text.toLowerCase() === 'saltar' ? '' : text;
    await saveEvent(chatId, state.nombre, state.fecha, state.descripcion, userName);
    delete addEventState[userId];
  }
}

async function handleConfirmation(chatId, userName) {
  const proposal = lastProposal[chatId];
  delete lastProposal[chatId];
  try {
    for (const ev of proposal.events) {
      await addEvent({ summary: `${ev.nombre} (org: ${userName})`, description: ev.descripcion || '', start: ev.fecha, end: new Date(ev.fecha.getTime() + 2*60*60*1000) });
    }
    const names = proposal.events.map(e => `• ${e.nombre} — ${formatDate(e.fecha)}`).join('\n');
    await bot.sendMessage(chatId, `✅ *Añadido al calendario:*\n${names}\n\n👤 Organiza: ${userName}`, { parse_mode: 'Markdown' });
  } catch (e) {
    await bot.sendMessage(chatId, '❌ Error añadiendo: ' + e.message);
  }
}

async function handleNaturalAdd(chatId, userId, text, userName) {
  await bot.sendChatAction(chatId, 'typing');
  try {
    const events = await getAllEvents().catch(() => []);
    const parsed = await parseEventFromText(text, events);
    if (!parsed || !parsed.length) {
      addEventState[userId] = { step: 'nombre', chatId };
      await bot.sendMessage(chatId, `No he pillado bien los detalles 😅 ¿Cómo se llama la actividad?`);
      return;
    }
    lastProposal[chatId] = { events: parsed };
    const summary = parsed.map(e => `• *${e.nombre}* — ${formatDate(e.fecha)}${e.descripcion ? '\n  📝 ' + e.descripcion : ''}`).join('\n');
    await bot.sendMessage(chatId, `➕ Añado esto al calendario:\n\n${summary}\n\n¿Confirmas? (sí/no)`, { parse_mode: 'Markdown' });
  } catch (e) {
    await handleAI(chatId, text, userName);
  }
}

async function handleAI(chatId, text, userName) {
  try {
    if (!conversationHistory[chatId]) conversationHistory[chatId] = [];
    conversationHistory[chatId].push({ role: 'user', content: `${userName}: ${text}` });
    if (conversationHistory[chatId].length > 20) conversationHistory[chatId] = conversationHistory[chatId].slice(-20);

    await bot.sendChatAction(chatId, 'typing');
    const events = await getAllEvents().catch(() => []);
    const weather = await getWeather().catch(() => 'No disponible');
    const { response, proposal } = await askAI(conversationHistory[chatId], events, weather, userName);

    conversationHistory[chatId].push({ role: 'assistant', content: response });
    if (proposal && proposal.length) lastProposal[chatId] = { events: proposal };

    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (e) {
    await bot.sendMessage(chatId, '❌ Error: ' + e.message);
  }
}

async function saveEvent(chatId, nombre, fecha, descripcion, userName) {
  try {
    await addEvent({ summary: `${nombre} (org: ${userName})`, description: descripcion, start: fecha, end: new Date(fecha.getTime() + 2*60*60*1000) });
    await bot.sendMessage(chatId, `✅ *${nombre}* añadido!\n📅 ${formatDate(fecha)}\n👤 Organiza: ${userName}`, { parse_mode: 'Markdown' });
  } catch (e) {
    await bot.sendMessage(chatId, '❌ Error: ' + e.message);
  }
}

function isConfirmation(text) {
  const t = text.toLowerCase().trim();
  return ['sí','si','sip','yes','dale','venga','ponlo','perfecto','genial','ok','vale','👍'].some(w => t === w || t.startsWith(w+' '));
}

function isAddIntent(text) {
  const t = text.toLowerCase();
  return t.startsWith('añade ') || t.startsWith('añadir ') || t.startsWith('agrega ') || t.startsWith('apunta ') || t.startsWith('mete ') || t.startsWith('pon en el calendario');
}

function formatEvents(events, title) {
  let text = `📅 *${title}*\n\n`;
  const byDay = {};
  events.forEach(e => {
    const key = new Date(e.start).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Tokyo' });
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(e);
  });
  for (const [day, dayEvents] of Object.entries(byDay)) {
    text += `*${day.charAt(0).toUpperCase()+day.slice(1)}*\n`;
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
  return date.toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
}

function parseDateTime(text) {
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const [, d, m, y, h, min] = match;
  return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${h.padStart(2,'0')}:${min}:00+09:00`);
}

module.exports = { bot, registeredUsers };
scheduleDaily(bot, registeredUsers);
