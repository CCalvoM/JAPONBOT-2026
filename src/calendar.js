const { google } = require('googleapis');

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const TRIP_START = new Date('2026-08-21T00:00:00+09:00');
const TRIP_END = new Date('2026-09-05T23:59:59+09:00');

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
}

async function getCalendar() {
  const auth = getAuth();
  return google.calendar({ version: 'v3', auth });
}

async function getUpcomingEvents(days = 7) {
  const calendar = await getCalendar();
  const now = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: 'Asia/Tokyo',
  });

  return (res.data.items || []).map(normalizeEvent);
}

async function getAllEvents() {
  const calendar = await getCalendar();

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: TRIP_START.toISOString(),
    timeMax: TRIP_END.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: 'Asia/Tokyo',
    maxResults: 250,
  });

  return (res.data.items || []).map(normalizeEvent);
}

async function addEvent({ summary, description, start, end }) {
  const calendar = await getCalendar();

  await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary,
      description,
      start: {
        dateTime: start.toISOString(),
        timeZone: 'Asia/Tokyo',
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: 'Asia/Tokyo',
      },
    },
  });
}

function normalizeEvent(event) {
  return {
    id: event.id,
    summary: event.summary || 'Sin título',
    description: event.description || '',
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    creator: event.creator?.email || '',
  };
}

module.exports = { getUpcomingEvents, getAllEvents, addEvent };
