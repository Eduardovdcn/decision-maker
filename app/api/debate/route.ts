type DebatePayload = {
  decision: string;
  side: "pro" | "con";
};

const SYSTEM_PRO =
  "Você é um debatedor profissional. Analise a decisão do usuário e identifique a posição A — seja ela 'fazer', 'escolher a primeira opção mencionada', ou o lado afirmativo da questão. Defenda essa posição com convicção absoluta. Se a decisão for comparativa (ex: 'usar X ou Y'), você defende X. Se for binária (ex: 'devo fazer X?'), você defende que sim. Se for aberta (ex: 'qual caminho seguir?'), você defende o caminho de maior mudança ou ação. Apresente exatamente 3 argumentos numerados. Cada argumento: claim direto em uma frase, duas frases de raciocínio concreto com exemplos reais, e uma frase de implicação prática para quem decide. Nunca conceda nenhum ponto ao lado oposto. Nunca use 'por outro lado', 'no entanto', 'claro que', 'apesar de'. Sem introduções. Sem disclaimers. Máximo 220 palavras. Responda SOMENTE em JSON válido no formato: {\"arguments\":[{\"text\":\"...\",\"strength\":0-100}]}. Retorne exatamente 3 argumentos. O campo strength deve refletir a força persuasiva daquele argumento (0 a 100). IMPORTANTE: para manter paridade visual com o lado CON (Gemini), os 3 textos devem ter tamanhos semelhantes com alvo de 320-420 caracteres cada e diferença máxima de 50 caracteres entre o maior e o menor. Sem markdown. Sem texto fora do JSON.";

const SYSTEM_CON =
  "Você é um debatedor profissional. Analise a decisão do usuário e identifique a posição B — seja ela 'não fazer', 'escolher a segunda opção mencionada', ou o lado negativo/alternativo da questão. Defenda essa posição com convicção absoluta. Se a decisão for comparativa (ex: 'usar X ou Y'), você defende Y. Se for binária (ex: 'devo fazer X?'), você defende que não. Se for aberta (ex: 'qual caminho seguir?'), você defende o caminho de menor risco ou manutenção do status quo. Apresente exatamente 3 argumentos numerados. Cada argumento: claim direto em uma frase, duas frases de raciocínio concreto com exemplos reais, e uma frase de implicação prática para quem decide. Nunca conceda nenhum ponto ao lado oposto. Nunca use 'por outro lado', 'no entanto', 'claro que', 'apesar de'. Sem introduções. Sem disclaimers. Máximo 220 palavras. Responda SOMENTE em JSON válido no formato: {\"arguments\":[{\"text\":\"...\",\"strength\":0-100}]}. Retorne exatamente 3 argumentos. O campo strength deve refletir a força persuasiva daquele argumento (0 a 100). Cada text deve ter uma frase de claim direto e assertivo, duas frases de raciocínio concreto e uma frase de implicação prática. Sem markdown. Sem texto fora do JSON.";

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

function createTextStreamFromSse(
  upstream: Response,
  extractText: (json: unknown) => string | undefined,
  parseErrorMessage: string
) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";

      const processLine = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line.startsWith("data: ")) return;

        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") return;

        try {
          const text = extractText(JSON.parse(data));
          if (text) controller.enqueue(encoder.encode(text));
        } catch {
          // Ignore malformed SSE line and continue streaming subsequent chunks.
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) processLine(rawLine);
        }

        const finalLine = buffer.trim();
        if (finalLine) processLine(finalLine);
      } catch (error) {
        const message = error instanceof Error ? error.message : parseErrorMessage;
        controller.enqueue(encoder.encode(`Error: ${message}`));
      } finally {
        controller.close();
      }
    },
  });
}

async function createGroqStream(decision: string, systemPrompt: string) {
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
          { role: "system", content: systemPrompt },
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

  const stream = createTextStreamFromSse(
    upstream,
    (json) => {
      const data = json as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      return data.choices?.[0]?.delta?.content;
    },
    "Failed to parse Groq stream."
  );

  return new Response(stream, { headers: responseHeaders() });
}

async function createGeminiStream(decision: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
  }

  const geminiModels = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite-preview-06-17",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ];
  let upstream: Response | null = null;
  let lastErrorText = "";

  for (const model of geminiModels) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=` +
      encodeURIComponent(apiKey);

    const response = await fetchWith429Retry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: decision }] }],
          systemInstruction: { parts: [{ text: SYSTEM_CON }] },
        }),
      },
      0
    );

    if (response.ok) {
      upstream = response;
      break;
    }

    lastErrorText = await response.text();
    // Keep trying different models when one is rate-limited/unavailable/not enabled.
    if (![429, 503, 404].includes(response.status)) {
      return Response.json(
        { error: lastErrorText || "Gemini request failed." },
        { status: response.status }
      );
    }
  }

  if (!upstream) {
    // Hard fallback: if Gemini is out of quota/unavailable, keep CON response working via Groq.
    const groqFallback = await createGroqStream(decision, SYSTEM_CON);
    if (groqFallback.ok) {
      return groqFallback;
    }

    const groqErrorText = await groqFallback.text();
    return Response.json(
      {
        error:
          groqErrorText ||
          lastErrorText ||
          "All Gemini fallback models are unavailable or out of quota. Please try again later.",
      },
      { status: 503 }
    );
  }

  if (!upstream.body) {
    return Response.json({ error: "Gemini stream body is empty." }, { status: 500 });
  }

  const stream = createTextStreamFromSse(
    upstream,
    (json) => {
      const data = json as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text;
    },
    "Failed to parse Gemini stream."
  );

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
      return await createGroqStream(decision, SYSTEM_PRO);
    }
    return await createGeminiStream(decision);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process debate request.";
    return Response.json({ error: message }, { status: 500 });
  }
}
