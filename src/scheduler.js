const { getUpcomingEvents, getAllEvents } = require('./calendar');
const { getWeather } = require('./weather');
const { askAI } = require('./ai');

// Simple cron-like scheduler using setInterval
function scheduleDaily(bot, registeredUsers) {
  // Check every minute if it's time to send the daily briefing
  setInterval(async () => {
    const now = new Date();

    // Send at 8:00 AM Japan time
    const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const hours = japanTime.getHours();
    const minutes = japanTime.getMinutes();

    if (hours === 8 && minutes === 0) {
      await sendDailyBriefing(bot, registeredUsers);
    }

    // Send activity reminders 1 hour before
    await checkReminders(bot, registeredUsers);

  }, 60 * 1000); // every minute

  console.log('⏰ Scheduler activado — briefing diario a las 8:00 hora Japón');
}

async function sendDailyBriefing(bot, registeredUsers) {
  try {
    const chatIds = getChatIds(registeredUsers);
    if (!chatIds.length) return;

    const events = await getUpcomingEvents(2);
    const weather = await getWeather();

    // Filter today's events
    const todayJapan = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const todayEvents = events.filter(e => {
      const eventDate = new Date(e.start);
      const eventJapan = new Date(eventDate.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
      return eventJapan.toDateString() === todayJapan.toDateString();
    });

    // Ask AI for a smart morning briefing
    const allEvents = await getAllEvents();
    const weatherText = await getWeather().catch(() => 'No disponible');

    const briefingPrompt = `Buenos días! Es la mañana del ${todayJapan.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}. 
    Genera un briefing matutino motivador y útil para el grupo. Incluye:
    1. Saludo animado para empezar el día
    2. Resumen de actividades de hoy
    3. Consejo basado en el tiempo
    4. Si procede, aviso inteligente tipo "mañana vais a X, así que hoy aprovechad para Y"
    Máximo 200 palabras, tono de amigo animado.`;

    const briefingHistory = [{ role: 'user', content: briefingPrompt }];
    const aiMessage = await askAI(briefingHistory, allEvents, weatherText, 'el grupo').catch(() => null);

    let message = `🌅 *Buenos días equipo Japón!*\n\n`;

    if (todayEvents.length === 0) {
      message += `📅 Hoy no hay actividades fijas — ¡día libre!\n\n`;
    } else {
      message += `📅 *Plan de hoy:*\n`;
      todayEvents.forEach(e => {
        const time = new Date(e.start).toLocaleTimeString('es-ES', {
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo'
        });
        message += `  🕐 ${time} — ${e.summary}\n`;
      });
      message += '\n';
    }

    message += weather + '\n\n';

    if (aiMessage) {
      message += `🤖 _${aiMessage}_`;
    }

    for (const chatId of chatIds) {
      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch(console.error);
    }

    console.log(`📨 Briefing diario enviado a ${chatIds.length} chats`);
  } catch (e) {
    console.error('Error enviando briefing diario:', e.message);
  }
}

async function checkReminders(bot, registeredUsers) {
  try {
    const chatIds = getChatIds(registeredUsers);
    if (!chatIds.length) return;

    const events = await getUpcomingEvents(1);
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const twoMinutesFromNow = new Date(now.getTime() + 62 * 60 * 1000);

    const upcoming = events.filter(e => {
      const start = new Date(e.start);
      return start >= oneHourFromNow && start <= twoMinutesFromNow;
    });

    for (const event of upcoming) {
      const time = new Date(event.start).toLocaleTimeString('es-ES', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo'
      });

      const message = `⏰ *Recordatorio — en 1 hora:*\n\n🎯 ${event.summary}\n🕐 ${time}h\n${event.description ? `📝 ${event.description}` : ''}`;

      for (const chatId of chatIds) {
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch(console.error);
      }
    }
  } catch (e) {
    // Silent fail for reminders
  }
}

function getChatIds(registeredUsers) {
  // Get unique chat IDs from registered users
  return [...new Set(Object.values(registeredUsers).map(u => u.chatId).filter(Boolean))];
}

module.exports = { scheduleDaily };
