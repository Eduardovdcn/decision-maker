type Side = "pro" | "con";

type InputArgument = {
  text: string;
  strength: number;
};

type VerdictPayload = {
  decision: string;
  proArguments: InputArgument[];
  conArguments: InputArgument[];
};

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
    const backoffMs = 500 * 2 ** attempt;
    attempt += 1;
    await sleep(backoffMs);
    response = await fetch(input, init);
  }

  return response;
}

const SYSTEM_VERDICT =
  "Você é um analista neutro de decisão. Receberá argumentos PRO e CON, cada um com strength (0-100). Sua tarefa é sintetizar os dois lados e dar um veredito final claro. Responda SOMENTE JSON válido no formato: {\"winner\":\"pro|con\",\"confidence\":0-100,\"proSummary\":\"...\",\"conSummary\":\"...\",\"finalReason\":\"...\"}. Regras: use a força agregada como base principal da decisão, mas considere qualidade textual; proSummary e conSummary com no máximo 2 frases cada; finalReason com 2-3 frases objetivas; sem markdown e sem texto fora do JSON.";

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Missing GROQ_API_KEY" }, { status: 500 });
  }

  let payload: VerdictPayload;

  try {
    payload = (await request.json()) as VerdictPayload;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const decision = payload?.decision?.trim();
  const proArguments = Array.isArray(payload?.proArguments) ? payload.proArguments : [];
  const conArguments = Array.isArray(payload?.conArguments) ? payload.conArguments : [];

  if (!decision || proArguments.length === 0 || conArguments.length === 0) {
    return Response.json(
      {
        error:
          "Invalid payload. Expected { decision, proArguments, conArguments } with non-empty arrays.",
      },
      { status: 400 }
    );
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
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_VERDICT },
          {
            role: "user",
            content: JSON.stringify({
              decision,
              proArguments,
              conArguments,
            }),
          },
        ],
      }),
    }
  );

  if (!upstream.ok) {
    const text = await upstream.text();
    return Response.json({ error: text || "Verdict generation failed." }, { status: upstream.status });
  }

  const completion = (await upstream.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = completion.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return Response.json({ error: "Empty verdict response." }, { status: 500 });
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return Response.json({ error: "Invalid verdict JSON output." }, { status: 500 });
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      winner?: Side;
      confidence?: number;
      proSummary?: string;
      conSummary?: string;
      finalReason?: string;
    };

    const winner = parsed.winner === "con" ? "con" : "pro";
    const confidence = Math.max(0, Math.min(100, Math.round(parsed.confidence ?? 50)));

    return Response.json({
      winner,
      confidence,
      proSummary: typeof parsed.proSummary === "string" ? parsed.proSummary : "",
      conSummary: typeof parsed.conSummary === "string" ? parsed.conSummary : "",
      finalReason: typeof parsed.finalReason === "string" ? parsed.finalReason : "",
    });
  } catch {
    return Response.json({ error: "Failed to parse verdict JSON." }, { status: 500 });
  }
}
