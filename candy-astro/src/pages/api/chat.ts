import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    console.error("Failed to parse JSON body:", e);
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  
  const { messages, systemPrompt } = body;
  try {
    console.log("Sending to Ollama:", { model: 'dolphin-llama3', messageCount: messages.length });

    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'dolphin-llama3',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Ollama Error Response:", errorText);
      return new Response(JSON.stringify({ error: `Ollama error: ${response.status}`, details: errorText }), { status: 502 });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("API Route Exception:", error);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
