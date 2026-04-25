"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import { useState } from "react"

type Side = "pro" | "con"
type DebateArgument = { text: string; strength: number }
type VerdictLLM = {
  winner: Side
  confidence: number
  proSummary: string
  conSummary: string
  finalReason: string
}

const EXAMPLE_DECISIONS = [
  "Quit my job to start a company?",
  "Move to another city for a better role?",
  "Focus on one startup idea or test three?",
]

function clampStrength(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function averageStrength(argumentsList: DebateArgument[]) {
  if (argumentsList.length === 0) return 0
  const total = argumentsList.reduce((sum, argument) => sum + argument.strength, 0)
  return Math.round(total / argumentsList.length)
}

function summarizeSide(argumentsList: DebateArgument[]) {
  if (argumentsList.length === 0) return "No arguments generated."
  const topTwo = [...argumentsList]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 2)
    .map((argument) => argument.text.replace(/\s+/g, " ").trim())
    .map((text) => text.split(".")[0]?.trim() ?? text)
    .filter(Boolean)

  if (topTwo.length === 0) return "No arguments generated."
  if (topTwo.length === 1) return topTwo[0]
  return `${topTwo[0]}. ${topTwo[1]}.`
}

function normalizeLabel(label: string) {
  const cleaned = label.replace(/[?.,;:!]+$/g, "").trim()
  if (!cleaned) return ""
  if (cleaned.length <= 24) return cleaned
  return `${cleaned.slice(0, 21).trim()}...`
}

function cleanOptionLabel(raw: string, isFirstOption: boolean) {
  let value = raw.trim()

  // Remove common leading prompt phrases from first option.
  if (isFirstOption) {
    value = value.replace(
      /^(devo|deveria|vale a pena|eh melhor|é melhor|qual|quero|preciso)\s+/i,
      ""
    )
    value = value.replace(/^(usar|escolher|adotar|seguir|ir de)\s+/i, "")
  }

  // Remove common trailing context from both options.
  value = value.replace(
    /\s+(no|na|nos|nas|para|pra|em|durante|dentro do|dentro da)\s+.+$/i,
    ""
  )

  // Remove wrappers around labels, e.g. "chatgpt", (chatgpt)
  value = value.replace(/^["'([{]+/, "").replace(/["')\]}]+$/, "")

  return normalizeLabel(value)
}

function deriveSideLabels(decisionInput: string) {
  const decision = decisionInput.trim()
  if (!decision) return { pro: "PRO", con: "CON" }

  const comparative =
    decision.match(/(.+?)\s+ou\s+(.+)/i) ||
    decision.match(/(.+?)\s+or\s+(.+)/i) ||
    decision.match(/(.+?)\s*\/\s*(.+)/)

  if (comparative) {
    const pro = cleanOptionLabel(comparative[1], true)
    const con = cleanOptionLabel(comparative[2], false)
    if (pro && con) return { pro, con }
  }

  return { pro: "Fazer", con: "Não fazer" }
}

function parseDebateArguments(rawText: string): DebateArgument[] {
  const text = rawText.trim()
  if (!text) return []

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        arguments?: Array<{ text?: string; strength?: number }>
      }
      const args = (parsed.arguments ?? [])
        .map((arg) => ({
          text: typeof arg.text === "string" ? arg.text.trim() : "",
          strength: clampStrength(typeof arg.strength === "number" ? arg.strength : 50),
        }))
        .filter((arg) => arg.text.length > 0)

      if (args.length > 0) return args
    } catch {
      // Try tolerant extraction when model outputs almost-JSON (e.g. unescaped quotes).
      const objectMatches = Array.from(
        text.matchAll(/"text"\s*:\s*"([\s\S]*?)"\s*,\s*"strength"\s*:\s*(\d{1,3})/g)
      )
      const tolerantArgs = objectMatches
        .map((match) => ({
          text: match[1]
            .replace(/\\"/g, '"')
            .replace(/\\n/g, "\n")
            .trim(),
          strength: clampStrength(Number(match[2])),
        }))
        .filter((arg) => arg.text.length > 0)

      if (tolerantArgs.length > 0) return tolerantArgs
    }
  }

  const numberedParts = text
    .split(/\n(?=\s*\d+\s*[\).:-]\s*)/)
    .map((part) => part.replace(/^\s*\d+\s*[\).:-]\s*/, "").trim())
    .filter(Boolean)
  if (numberedParts.length >= 2) {
    return numberedParts.slice(0, 3).map((part) => ({ text: part, strength: 50 }))
  }

  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => ({
      text: part.replace(/^\s*\d+\s*[\).:-]\s*/, ""),
      strength: 50,
    }))
}

function sideBadge(side: Side) {
  return side === "pro"
    ? {
        defaultLabel: "PRO",
        dotClass: "bg-[#22c97a]",
        textClass: "text-[#22c97a]",
        borderClass: "border-[#22c97a]",
        cardClass: "border-[#1f2a24] bg-[#0c1410]",
        paragraphClass: "text-[#d9fbe8]",
        imageUrl:
          "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&auto=format&fit=crop&q=80",
        imageAlt: "Team celebrating progress and momentum",
      }
    : {
        defaultLabel: "CON",
        dotClass: "bg-[#f04b57]",
        textClass: "text-[#f04b57]",
        borderClass: "border-[#f04b57]",
        cardClass: "border-[#3a1f24] bg-[#170d10]",
        paragraphClass: "text-[#ffd7dc]",
        imageUrl:
          "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&auto=format&fit=crop&q=80",
        imageAlt: "Complex road sign representing trade-offs and risks",
      }
}

// ─── Small components ─────────────────────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 py-4">
      <div className="flex gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-[#71717a] animate-pulse-dot-1" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#71717a] animate-pulse-dot-2" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#71717a] animate-pulse-dot-3" />
      </div>
      <span className="font-mono text-[11px] text-[#71717a]">researching...</span>
    </div>
  )
}

function ScoreBar({
  proLabel,
  conLabel,
  proCount,
  conCount,
  totalCount,
  visible,
}: {
  proLabel: string
  conLabel: string
  proCount: number
  conCount: number
  totalCount: number
  visible: boolean
}) {
  const total = proCount + conCount
  const proPercent = total > 0 ? (proCount / total) * 100 : 50
  const completionPercent = Math.round((total / totalCount) * 100)

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 0.5s ease-out, transform 0.5s ease-out",
      }}
    >
      <div className="flex items-center gap-4 mb-2">
        <span className="font-mono text-[12px] text-[#22c97a]">
          {proLabel.toUpperCase()} {proCount}
        </span>
        <div className="flex-1 h-[3px] bg-[#1e2028] rounded-full overflow-hidden flex">
          <div
            className="h-full bg-[#22c97a] transition-all duration-500 ease-out"
            style={{ width: `${proPercent}%` }}
          />
          <div
            className="h-full bg-[#f04b57] transition-all duration-500 ease-out"
            style={{ width: `${100 - proPercent}%` }}
          />
        </div>
        <span className="font-mono text-[12px] text-[#f04b57]">
          {conLabel.toUpperCase()} {conCount}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-[#71717a]">
          {total}/{totalCount} arguments analyzed
        </span>
        <span className="font-mono text-[11px] text-[#71717a]">{completionPercent}% complete</span>
      </div>
    </div>
  )
}

function DonutChart({ proPercent }: { proPercent: number }) {
  const r = 40
  const circumference = 2 * Math.PI * r
  const proLength = (proPercent / 100) * circumference
  const conLength = circumference - proLength

  return (
    <svg width="80" height="80" viewBox="0 0 100 100" aria-hidden="true">
      <circle
        cx="50" cy="50" r={r}
        fill="none"
        stroke="#f04b57"
        strokeWidth="8"
        strokeDasharray={`${conLength} ${circumference}`}
        transform="rotate(-90 50 50)"
      />
      <circle
        cx="50" cy="50" r={r}
        fill="none"
        stroke="#22c97a"
        strokeWidth="8"
        strokeDasharray={`${proLength} ${circumference}`}
        strokeDashoffset={-conLength}
        transform="rotate(-90 50 50)"
      />
    </svg>
  )
}

function Verdict({
  proArguments,
  conArguments,
  llmVerdict,
  visible,
  onReset,
}: {
  proArguments: DebateArgument[]
  conArguments: DebateArgument[]
  llmVerdict: VerdictLLM | null
  visible: boolean
  onReset: () => void
}) {
  const proAvgStrength = averageStrength(proArguments)
  const conAvgStrength = averageStrength(conArguments)
  const proTotalStrength = proArguments.reduce((sum, argument) => sum + argument.strength, 0)
  const conTotalStrength = conArguments.reduce((sum, argument) => sum + argument.strength, 0)
  const totalStrength = proTotalStrength + conTotalStrength
  const proPercent = totalStrength > 0 ? Math.round((proTotalStrength / totalStrength) * 100) : 50
  const leansPro = llmVerdict ? llmVerdict.winner === "pro" : proTotalStrength >= conTotalStrength
  const confidence = llmVerdict
    ? llmVerdict.confidence
    : Math.min(100, Math.abs(proTotalStrength - conTotalStrength))
  const proSummary = summarizeSide(proArguments)
  const conSummary = summarizeSide(conArguments)
  const finalReason = llmVerdict?.finalReason?.trim()

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 0.5s ease-out, transform 0.5s ease-out",
      }}
    >
      <div
        className="rounded-xl p-6 md:p-7 border border-[#2b2f38]"
        style={{
          background:
            "linear-gradient(135deg, rgba(15,17,23,0.98), rgba(20,23,31,0.98) 60%, rgba(15,17,23,0.98))",
        }}
      >
        <span className="inline-flex mb-4 px-2.5 py-1 rounded-md font-mono text-[10px] uppercase tracking-[0.12em] text-[#a1a1aa] bg-[#141925] border border-[#232a39]">
          Final Verdict
        </span>
        <div className="flex items-center gap-6">
          <span className="font-serif text-5xl text-[#52525b] select-none">V</span>
          <div className="flex-1">
            <h3 className="font-serif text-xl text-[#fafafa] mb-1">
              Leans {leansPro ? "PRO" : "CON"}
            </h3>
            <p className="font-mono text-[13px] text-[#a1a1aa] leading-relaxed">
              {finalReason ||
                (leansPro
                  ? "PRO apresentou maior força agregada. A recomendação final é seguir com a decisão, mitigando riscos operacionais no curto prazo."
                  : "CON apresentou maior força agregada. A recomendação final é não seguir agora e reduzir incertezas antes de se comprometer.")}
            </p>
          </div>
          <DonutChart proPercent={proPercent} />
        </div>
        <div className="mt-5 pt-4 border-t border-[#252833] grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-md border border-[#1f2a24] bg-[#0c1410] p-3">
            <p className="font-mono text-[11px] text-[#22c97a] uppercase tracking-wider mb-1">
              PRO Summary
            </p>
            <p className="font-mono text-[12px] text-[#d9fbe8] leading-relaxed">
              {llmVerdict?.proSummary?.trim() || proSummary}
            </p>
            <p className="font-mono text-[11px] text-[#8ee7bf] mt-2">
              Avg {proAvgStrength}% · Total {proTotalStrength}
            </p>
          </div>
          <div className="rounded-md border border-[#3a1f24] bg-[#170d10] p-3">
            <p className="font-mono text-[11px] text-[#f04b57] uppercase tracking-wider mb-1">
              CON Summary
            </p>
            <p className="font-mono text-[12px] text-[#ffd7dc] leading-relaxed">
              {llmVerdict?.conSummary?.trim() || conSummary}
            </p>
            <p className="font-mono text-[11px] text-[#ff9aa4] mt-2">
              Avg {conAvgStrength}% · Total {conTotalStrength}
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-[#252833] flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] text-[#71717a] uppercase tracking-wider">Confidence</p>
            <p className="font-mono text-[13px] text-[#d4d4d8] mt-1">{confidence}% signal strength</p>
          </div>
          <button
            onClick={onReset}
            className="font-mono text-[11px] px-3 py-2 rounded-md border border-[#2b2f38] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#3f3f46] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#71717a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]"
          >
            Try another decision
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DecisionMaker() {
  const [decision, setDecision] = useState("")
  const [debateStarted, setDebateStarted] = useState(false)
  const [showVerdict, setShowVerdict] = useState(false)
  const [proThinking, setProThinking] = useState(false)
  const [conThinking, setConThinking] = useState(false)
  const [proArguments, setProArguments] = useState<DebateArgument[]>([])
  const [conArguments, setConArguments] = useState<DebateArgument[]>([])
  const [llmVerdict, setLlmVerdict] = useState<VerdictLLM | null>(null)
  const [debateRunId, setDebateRunId] = useState(0)

  const proCount = proArguments.length
  const conCount = conArguments.length
  const isLoading = proThinking || conThinking
  const sideLabels = deriveSideLabels(decision)

  const fetchDebate = async (decisionInput: string, side: Side) => {
    const response = await fetch("/api/debate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision: decisionInput, side }),
    })

    if (!response.ok) {
      let errorMessage = `Failed to fetch ${side.toUpperCase()} argument.`
      try {
        const data = await response.json()
        if (typeof data?.error === "string" && data.error.trim()) {
          errorMessage = data.error
        }
      } catch {
        try {
          const text = await response.text()
          if (text.trim()) errorMessage = text
        } catch {
          // keep default message
        }
      }
      throw new Error(errorMessage)
    }

    if (!response.body) {
      throw new Error("No response body received from debate API.")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      if (chunk) {
        fullText += chunk
      }
    }

    const finalChunk = decoder.decode()
    if (finalChunk) {
      fullText += finalChunk
    }

    return fullText
  }

  const fetchVerdict = async (
    decisionInput: string,
    proItems: DebateArgument[],
    conItems: DebateArgument[]
  ) => {
    const response = await fetch("/api/verdict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision: decisionInput,
        proArguments: proItems,
        conArguments: conItems,
      }),
    })

    if (!response.ok) return null

    const data = (await response.json()) as VerdictLLM
    if (!data || (data.winner !== "pro" && data.winner !== "con")) return null

    return {
      winner: data.winner,
      confidence: clampStrength(typeof data.confidence === "number" ? data.confidence : 50),
      proSummary: typeof data.proSummary === "string" ? data.proSummary : "",
      conSummary: typeof data.conSummary === "string" ? data.conSummary : "",
      finalReason: typeof data.finalReason === "string" ? data.finalReason : "",
    } satisfies VerdictLLM
  }

  const startDebate = async () => {
    const trimmedDecision = decision.trim()
    if (!trimmedDecision) return

    setDebateStarted(true)
    setProThinking(true)
    setConThinking(true)
    setShowVerdict(false)
    setProArguments([])
    setConArguments([])
    setLlmVerdict(null)
    setDebateRunId((prev) => prev + 1)

    const [proText, conText] = await Promise.all([
      fetchDebate(trimmedDecision, "pro").catch((error) =>
        error instanceof Error ? error.message : "Unable to load PRO argument right now."
      ),
      fetchDebate(trimmedDecision, "con").catch((error) =>
        error instanceof Error ? error.message : "Unable to load CON argument right now."
      ),
    ])

    const parsedPro = parseDebateArguments(proText)
    const parsedCon = parseDebateArguments(conText)

    setProArguments(parsedPro)
    setConArguments(parsedCon)

    const verdict = await fetchVerdict(trimmedDecision, parsedPro, parsedCon)
    setLlmVerdict(verdict)
    setProThinking(false)
    setConThinking(false)
    setShowVerdict(true)
  }

  const reset = () => {
    setDecision("")
    setDebateStarted(false)
    setShowVerdict(false)
    setProThinking(false)
    setConThinking(false)
    setProArguments([])
    setConArguments([])
    setLlmVerdict(null)
  }

  return (
    <main className="min-h-screen relative">
      {/* Background */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `url(https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1600)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[#080a0f]/[0.93]" />
      </div>

      {/* Grid texture */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(to right, #fff 1px, transparent 1px),
                            linear-gradient(to bottom, #fff 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-12 md:py-20">

        {/* Header */}
        <header className="text-center mb-10">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#71717a]">
            Decision Maker
          </span>
          <h1 className="font-serif text-[28px] text-[#fafafa] mt-2 italic">
            Both sides. One decision.
          </h1>
          <div className="mt-6 h-px bg-[#1e2028]" />
        </header>

        {/* Input card */}
        <div className="rounded-lg p-4 md:p-5 bg-[#0f1117] border border-[#1e2028] mb-10">
          <textarea
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            placeholder="Describe the decision you need to make..."
            rows={2}
            className="w-full bg-transparent font-mono text-[15px] text-[#fafafa] placeholder:text-[#71717a] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3f3f46] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117] rounded"
            disabled={isLoading}
            aria-label="Decision input"
          />
          <div className="flex items-end justify-between mt-4 gap-4">
            <p className="font-mono text-[12px] text-[#71717a] max-w-md">
              PRO and CON will research and make the best case possible for each side
            </p>
            <button
              onClick={startDebate}
              disabled={!decision.trim() || isLoading}
              className="shrink-0 bg-[#ffffff] text-[#000000] hover:bg-[#e4e4e7] disabled:opacity-40 disabled:cursor-not-allowed font-sans text-xs uppercase tracking-wider px-5 py-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fafafa] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]"
            >
              {isLoading ? "Loading..." : "Start Debate →"}
            </button>
          </div>
          {!debateStarted && (
            <div className="mt-4 pt-4 border-t border-[#1e2028]">
              <p className="font-mono text-[11px] text-[#71717a] mb-2">Quick examples:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_DECISIONS.map((example) => (
                  <button
                    key={example}
                    onClick={() => setDecision(example)}
                    className="font-mono text-[11px] px-2.5 py-1.5 rounded-md border border-[#2a2d36] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#4a4d57] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#71717a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Score bar */}
        {debateStarted && (
          <div className="mb-8">
            <ScoreBar
              proLabel={sideLabels.pro}
              conLabel={sideLabels.con}
              proCount={proCount}
              conCount={conCount}
              totalCount={6}
              visible={debateStarted}
            />
          </div>
        )}

        {/* Debate columns */}
        {debateStarted && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {(["pro", "con"] as const).map((side, sideIndex) => {
              const style = sideBadge(side)
              const argumentsBySide = side === "pro" ? proArguments : conArguments
              const isThinkingSide = side === "pro" ? proThinking : conThinking

              return (
                <motion.section
                  key={`${side}-${debateRunId}`}
                  className={`rounded-lg p-4 bg-[#0b0e14] border-l-2 ${style.borderClass}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: "easeOut", delay: sideIndex * 0.05 }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${style.dotClass}`} />
                      <span className={`font-mono text-[11px] uppercase tracking-wider ${style.textClass}`}>
                        {(side === "pro" ? sideLabels.pro : sideLabels.con) || style.defaultLabel}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-[#71717a]">
                      {argumentsBySide.length}
                    </span>
                  </div>

                  <Image
                    src={style.imageUrl}
                    alt={style.imageAlt}
                    width={1200}
                    height={400}
                    className="w-full h-28 object-cover rounded-md border border-[#1e2028] mb-4"
                  />

                  <div className="flex flex-col gap-3">
                    {isThinkingSide && <ThinkingIndicator />}
                    {argumentsBySide.map((argument, index) => (
                      <motion.article
                        key={`${side}-arg-${index}-${debateRunId}`}
                        className={`rounded-md border p-3 ${style.cardClass}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut", delay: index * 0.05 }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={`font-mono text-[11px] ${style.textClass}`}>
                            Strength {argument.strength}%
                          </span>
                          <div className="w-20 h-1.5 rounded-full bg-[#1e2028] overflow-hidden">
                            <div
                              className={`h-full ${style.dotClass}`}
                              style={{ width: `${argument.strength}%` }}
                            />
                          </div>
                        </div>
                        <p
                          className={`font-mono text-[13px] leading-6 whitespace-pre-wrap ${style.paragraphClass}`}
                        >
                          {argument.text}
                        </p>
                      </motion.article>
                    ))}
                  </div>
                </motion.section>
              )
            })}
          </div>
        )}

        {/* Verdict */}
        {showVerdict && (
          <div className="mb-8">
            <Verdict
              proArguments={proArguments}
              conArguments={conArguments}
              llmVerdict={llmVerdict}
              visible={showVerdict}
              onReset={reset}
            />
          </div>
        )}

        {/* Reset */}
        {showVerdict && (
          <div className="text-center">
            <button
              onClick={reset}
              className="font-mono text-[12px] text-[#71717a] hover:text-[#fafafa] transition-colors px-2 py-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#71717a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]"
            >
              ↺ reset
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
