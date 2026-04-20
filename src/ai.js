const OpenAI = require('openai');

let client = null;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

const SYSTEM_PROMPT = `Eres Leslie Chow, el asistente oficial del viaje a Japón 2026 de un grupo de 10 amigos españoles.
El viaje es del 21 de agosto al 5 de septiembre de 2026, pasando por Osaka, Kyoto y Tokio.

Tu personalidad:
- Eres como un amigo más del grupo, cercano y con humor
- Hablas en español informal, como un colega
- Usas emojis con moderación
- Eres experto en Japón: cultura, transporte, gastronomía, costumbres, atracciones

Tu misión:
- Ayudar a organizar el itinerario y resolver dudas sobre el viaje
- Cuando el grupo tiene dudas entre opciones, analizas el itinerario completo y das una recomendación razonada
- Si ves actividades similares en días seguidos, lo señalas y propones alternativas
- Si el tiempo va a ser malo, sugieres ajustes al plan
- Sugieres actividades nuevas cuando hay huecos libres

IMPORTANTE — Cuando propongas actividades concretas con fecha y hora, incluye al final de tu respuesta un bloque JSON así:
<PROPOSAL>
[{"nombre":"Nombre actividad","fecha":"2026-08-22T10:00:00+09:00","descripcion":"descripción opcional"}]
</PROPOSAL>

Solo incluye el bloque PROPOSAL cuando propongas algo concreto con fecha específica que el usuario podría querer añadir al calendario. Si solo das recomendaciones generales sin fecha concreta, NO incluyas PROPOSAL.

Responde siempre en español. Máximo 300 palabras.`;

async function askAI(conversationHistory, events, weather, userName) {
  const eventsText = events.length > 0
    ? events.map(e => {
        const date = new Date(e.start).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
        return `• ${date}: ${e.summary}${e.description ? ' — ' + e.description : ''}`;
      }).join('\n')
    : 'El itinerario está vacío todavía.';

  const messages = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\n\nITINERARIO ACTUAL:\n${eventsText}\n\nTIEMPO ACTUAL EN JAPÓN:\n${weather}\n\nEl usuario que escribe ahora: ${userName}`
    },
    ...conversationHistory.slice(-15),
  ];

  const result = await getClient().chat.completions.create({
    model: 'gpt-4o',
    messages,
    max_tokens: 600,
    temperature: 0.7,
  });

  const raw = result.choices[0].message.content;

  // Extract proposal if present
  const proposalMatch = raw.match(/<PROPOSAL>([\s\S]*?)<\/PROPOSAL>/);
  let proposal = null;
  let response = raw.replace(/<PROPOSAL>[\s\S]*?<\/PROPOSAL>/g, '').trim();

  if (proposalMatch) {
    try {
      const parsed = JSON.parse(proposalMatch[1].trim());
      proposal = parsed.map(e => ({
        nombre: e.nombre,
        fecha: new Date(e.fecha),
        descripcion: e.descripcion || '',
      }));
    } catch (_) {}
  }

  return { response, proposal };
}

async function parseEventFromText(text, existingEvents) {
  const today = new Date().toLocaleDateString('es-ES', { timeZone: 'Asia/Tokyo' });

  const messages = [
    {
      role: 'system',
      content: `Eres un parser de eventos para un viaje a Japón del 21 agosto al 5 septiembre 2026.
Extrae la información del evento del texto del usuario y devuelve SOLO un JSON array sin ningún texto adicional.
Formato: [{"nombre":"string","fecha":"ISO8601 con timezone +09:00","descripcion":"string o vacío"}]
Si no puedes extraer una fecha concreta, usa null en fecha.
Hoy es ${today}. El viaje es en 2026.`
    },
    { role: 'user', content: text }
  ];

  const result = await getClient().chat.completions.create({
    model: 'gpt-4o',
    messages,
    max_tokens: 200,
    temperature: 0,
  });

  const raw = result.choices[0].message.content.trim();
  const clean = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  return parsed.map(e => ({
    nombre: e.nombre,
    fecha: e.fecha ? new Date(e.fecha) : null,
    descripcion: e.descripcion || '',
  })).filter(e => e.nombre && e.fecha);
}

module.exports = { askAI, parseEventFromText };
