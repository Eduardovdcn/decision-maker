type DebatePayload = {
  decision: string;
  side: "pro" | "con";
};

const SYSTEM_PRO =
  "Você é um debatedor profissional. Defenda rigorosamente que a pessoa DEVE tomar esta decisão. Apresente exatamente 3 argumentos numerados. Cada argumento tem: uma frase de claim direto e assertivo, duas frases de raciocínio concreto, uma frase de implicação prática. Nunca use 'por outro lado', 'no entanto' ou qualquer concessão ao lado oposto. Sem introduções. Sem disclaimers. Máximo 200 palavras.";

const SYSTEM_CON =
  "Você é um debatedor profissional. Defenda rigorosamente que a pessoa NÃO DEVE tomar esta decisão. Apresente exatamente 3 argumentos numerados. Cada argumento tem: uma frase de claim direto e assertivo, duas frases de raciocínio concreto, uma frase de implicação prática. Nunca use 'por outro lado', 'no entanto' ou qualquer concessão ao lado oposto. Sem introduções. Sem disclaimers. Máximo 200 palavras.";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWith429Retry(
  input: string,
  init: RequestInit,
  maxRetries = 2
) {
  let attempt = 0;
  let response = await fetch(input, init);

  while (response.status === 429 && attempt < maxRetries) {
    const backoffMs = 400 * 2 ** attempt;
    attempt += 1;
    await sleep(backoffMs);
    response = await fetch(input, init);
  }

  return response;
}

function responseHeaders() {
  return {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

async function createGroqStream(decision: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Missing GROQ_API_KEY" }, { status: 500 });
  }

  const upstream = await fetchWith429Retry(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PRO },
          { role: "user", content: decision },
        ],
      }),
    }
  );

  if (!upstream.ok) {
    const text = await upstream.text();
    return Response.json({ error: text || "Groq request failed." }, { status: upstream.status });
  }

  if (!upstream.body) {
    return Response.json({ error: "Groq stream body is empty." }, { status: 500 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("data: ")) continue;

            const data = line.slice(6).trim();
            if (!data || data === "[DONE]") continue;

            const json = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const text = json.choices?.[0]?.delta?.content;
            if (text) controller.enqueue(encoder.encode(text));
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to parse Groq stream.";
        controller.enqueue(encoder.encode(`Error: ${message}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: responseHeaders() });
}

async function createGeminiStream(decision: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
  }

  const geminiModels = ["gemini-3-flash-preview", "gemini-2.0-flash"];
  let upstream: Response | null = null;
  let lastErrorText = "";

  for (const model of geminiModels) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=` +
      encodeURIComponent(apiKey);

    const response = await fetchWith429Retry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: decision }] }],
        systemInstruction: { parts: [{ text: SYSTEM_CON }] },
      }),
    });

    if (response.ok) {
      upstream = response;
      break;
    }

    lastErrorText = await response.text();
    if (response.status !== 503) {
      return Response.json(
        { error: lastErrorText || "Gemini request failed." },
        { status: response.status }
      );
    }
  }

  if (!upstream) {
    return Response.json(
      {
        error:
          lastErrorText ||
          "Gemini models are temporarily unavailable. Please try again later.",
      },
      { status: 503 }
    );
  }

  if (!upstream.body) {
    return Response.json({ error: "Gemini stream body is empty." }, { status: 500 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("data: ")) continue;

            const data = line.slice(6).trim();
            if (!data || data === "[DONE]") continue;

            const json = JSON.parse(data) as {
              candidates?: Array<{
                content?: { parts?: Array<{ text?: string }> };
              }>;
            };
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) controller.enqueue(encoder.encode(text));
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to parse Gemini stream.";
        controller.enqueue(encoder.encode(`Error: ${message}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: responseHeaders() });
}

export async function POST(request: Request) {
  let payload: DebatePayload;

  try {
    payload = (await request.json()) as DebatePayload;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const decision = payload?.decision?.trim();
  const side = payload?.side;

  if (!decision || (side !== "pro" && side !== "con")) {
    return Response.json(
      {
        error:
          "Invalid payload. Expected { decision: string, side: 'pro' | 'con' }.",
      },
      { status: 400 }
    );
  }

  try {
    if (side === "pro") {
      return await createGroqStream(decision);
    }
    return await createGeminiStream(decision);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process debate request.";
    return Response.json({ error: message }, { status: 500 });
  }
}
