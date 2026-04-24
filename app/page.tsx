"use client"

import { useState } from "react"

type Side = "pro" | "con"

const EXAMPLE_DECISIONS = [
  "Quit my job to start a company?",
  "Move to another city for a better role?",
  "Focus on one startup idea or test three?",
]

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
  proCount,
  conCount,
  totalCount,
  visible,
}: {
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
        <span className="font-mono text-[12px] text-[#22c97a]">PRO {proCount}</span>
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
        <span className="font-mono text-[12px] text-[#f04b57]">CON {conCount}</span>
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
  proCount,
  conCount,
  visible,
  onReset,
}: {
  proCount: number
  conCount: number
  visible: boolean
  onReset: () => void
}) {
  const total = proCount + conCount
  const proPercent = total > 0 ? Math.round((proCount / total) * 100) : 50
  const leansPro = proCount >= conCount
  const confidence = Math.abs(proCount - conCount) * 10

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
              {leansPro
                ? "The potential upside and skill development opportunities outweigh the significant risks for those with validated ideas."
                : "The structural failure rates and financial risks suggest validating before quitting is the more prudent path."}
            </p>
          </div>
          <DonutChart proPercent={proPercent} />
        </div>
        <div className="mt-5 pt-4 border-t border-[#252833] flex items-center justify-between gap-4">
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
  const [proResponse, setProResponse] = useState("")
  const [conResponse, setConResponse] = useState("")

  const proCount = proResponse ? 1 : 0
  const conCount = conResponse ? 1 : 0
  const isLoading = proThinking || conThinking

  const streamDebate = async (
    side: Side,
    onChunk: (chunk: string) => void
  ) => {
    const response = await fetch("/api/debate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision: decision.trim(), side }),
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

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      onChunk(decoder.decode(value, { stream: true }))
    }
  }

  const startDebate = async () => {
    if (!decision.trim()) return

    setDebateStarted(true)
    setProThinking(true)
    setConThinking(true)
    setShowVerdict(false)
    setProResponse("")
    setConResponse("")

    const proPromise = streamDebate("pro", (chunk) => {
      setProResponse((prev) => prev + chunk)
    })
      .catch((error) =>
        setProResponse(
          error instanceof Error ? error.message : "Unable to load PRO argument right now."
        )
      )
      .finally(() => setProThinking(false))

    const conPromise = streamDebate("con", (chunk) => {
      setConResponse((prev) => prev + chunk)
    })
      .catch((error) =>
        setConResponse(
          error instanceof Error ? error.message : "Unable to load CON argument right now."
        )
      )
      .finally(() => setConThinking(false))

    await Promise.allSettled([proPromise, conPromise])
    setShowVerdict(true)
  }

  const reset = () => {
    setDecision("")
    setDebateStarted(false)
    setShowVerdict(false)
    setProThinking(false)
    setConThinking(false)
    setProResponse("")
    setConResponse("")
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
              proCount={proCount}
              conCount={conCount}
              totalCount={2}
              visible={debateStarted}
            />
          </div>
        )}

        {/* Debate columns */}
        {debateStarted && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* PRO */}
            <section
              className="rounded-lg p-4 bg-[#0b0e14] border-l-2 border-[#22c97a]"
              aria-label="Pro arguments"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#22c97a]" />
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#22c97a]">
                    PRO
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[#71717a]">
                  {proCount}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {proThinking && <ThinkingIndicator />}
                {proResponse && (
                  <div className="rounded-md border border-[#1f2a24] bg-[#0c1410] p-3">
                    <p className="font-mono text-[13px] leading-6 text-[#d9fbe8] whitespace-pre-wrap">
                      {proResponse}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* CON */}
            <section
              className="rounded-lg p-4 bg-[#0b0e14] border-l-2 border-[#f04b57]"
              aria-label="Con arguments"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#f04b57]" />
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#f04b57]">
                    CON
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[#71717a]">
                  {conCount}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {conThinking && <ThinkingIndicator />}
                {conResponse && (
                  <div className="rounded-md border border-[#3a1f24] bg-[#170d10] p-3">
                    <p className="font-mono text-[13px] leading-6 text-[#ffd7dc] whitespace-pre-wrap">
                      {conResponse}
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* Verdict */}
        {showVerdict && (
          <div className="mb-8">
            <Verdict
              proCount={proCount}
              conCount={conCount}
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
