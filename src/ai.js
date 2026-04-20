const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Eres el asistente oficial del viaje a Japón 2026 de un grupo de 10 amigos españoles.
El viaje es del 21 de agosto al 5 de septiembre de 2026, pasando por Osaka, Kyoto y Tokio.

Tu personalidad:
- Eres como un amigo más del grupo, cercano y con humor
- Hablas en español informal, como un colega
- Usas emojis con moderación
- Eres experto en Japón: cultura, transporte, gastronomía, costumbres, atracciones

Tu misión:
- Ayudar a organizar el itinerario y resolver dudas sobre el viaje
- Cuando el grupo tiene dudas entre opciones, analizas el itinerario completo y das una recomendación razonada
- Si ves que tienen actividades similares en días seguidos, lo señalas y propones alternativas
- Si el tiempo va a ser malo, sugieres ajustes al plan
- Aprendes los gustos del grupo según lo que eligen
- Sugieres actividades nuevas cuando hay huecos libres

Información del itinerario actual te la paso en cada mensaje.
Responde siempre en español. Sé conciso pero útil. Máximo 300 palabras por respuesta.`;

async function askAI(conversationHistory, events, weather, userName) {
  // Build context with current itinerary and weather
  const eventsText = events.length > 0
    ? events.map(e => {
        const date = new Date(e.start).toLocaleString('es-ES', {
          weekday: 'short', day: 'numeric', month: 'short',
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo'
        });
        return `• ${date}: ${e.summary}${e.description ? ' — ' + e.description : ''}`;
      }).join('\n')
    : 'El itinerario está vacío todavía.';

  const contextMessage = {
    role: 'system',
    content: `${SYSTEM_PROMPT}

ITINERARIO ACTUAL:
${eventsText}

TIEMPO ACTUAL EN JAPÓN:
${weather}

El usuario que escribe ahora se llama: ${userName}`
  };

  const messages = [
    contextMessage,
    ...conversationHistory.slice(-15), // últimos 15 mensajes
  ];

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages,
    max_tokens: 500,
    temperature: 0.7,
  });

  return response.choices[0].message.content;
}

module.exports = { askAI };
