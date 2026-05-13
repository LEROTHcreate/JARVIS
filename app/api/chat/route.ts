import { NextRequest } from "next/server";
import { z } from "zod";
import {
  ChatMessage,
  ToolCall,
  executeTool,
  extractMapPins,
  streamLLMChat,
} from "@/lib/claude";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        // Data URL d'image jointe (uniquement sur les messages user).
        image: z.string().optional(),
      }),
    )
    .min(1),
  userLocation: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
});

const SENTINEL = "[[MAP]]";
const HOLD = SENTINEL.length - 1;
const MAX_TOOL_ITER = 5;

export async function POST(req: NextRequest) {
  // 30 requêtes / minute / IP — protège le quota Groq
  const limited = rateLimit(req, "chat", 30, 60_000);
  if (limited) return limited;

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return new Response("Invalid body", { status: 400 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        let conv: ChatMessage[] = parsed.messages.map((m) => {
          if (m.role === "user") {
            return {
              role: "user",
              content: m.content,
              ...(m.image ? { image: m.image } : {}),
            };
          }
          return { role: "assistant", content: m.content };
        });

        for (let iter = 0; iter < MAX_TOOL_ITER; iter++) {
          const body = await streamLLMChat(conv, {
            userLocation: parsed.userLocation,
          });
          const reader = body.getReader();

          let sseBuffer = "";
          let fullText = "";
          let lastSentLen = 0;
          const toolAccs: Record<
            number,
            { id: string; name: string; args: string }
          > = {};

          const flushVisible = (final: boolean) => {
            const idx = fullText.indexOf(SENTINEL);
            let visibleLen: number;
            if (idx === -1) {
              visibleLen = final
                ? fullText.length
                : Math.max(0, fullText.length - HOLD);
            } else {
              visibleLen = idx;
            }
            if (visibleLen > lastSentLen) {
              send({
                type: "delta",
                text: fullText.slice(lastSentLen, visibleLen),
              });
              lastSentLen = visibleLen;
            }
          };

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            sseBuffer += decoder.decode(value, { stream: true });

            let nl: number;
            while ((nl = sseBuffer.indexOf("\n")) !== -1) {
              const rawLine = sseBuffer.slice(0, nl);
              sseBuffer = sseBuffer.slice(nl + 1);
              const line = rawLine.trim();
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (!data || data === "[DONE]") continue;

              try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta;
                if (!delta) continue;

                if (
                  typeof delta.content === "string" &&
                  delta.content.length
                ) {
                  fullText += delta.content;
                  flushVisible(false);
                }

                if (Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const idx = typeof tc.index === "number" ? tc.index : 0;
                    if (!toolAccs[idx]) {
                      toolAccs[idx] = { id: "", name: "", args: "" };
                    }
                    if (tc.id) toolAccs[idx].id = tc.id;
                    if (tc.function?.name) {
                      toolAccs[idx].name = tc.function.name;
                    }
                    if (typeof tc.function?.arguments === "string") {
                      toolAccs[idx].args += tc.function.arguments;
                    }
                  }
                }
              } catch {
                // chunk JSON partiel, on ignore
              }
            }
          }

          flushVisible(true);

          const { pins } = extractMapPins(fullText);
          if (pins.length) send({ type: "pins", pins });

          const toolCalls: ToolCall[] = Object.values(toolAccs)
            .filter((t) => t.id && t.name)
            .map((t) => ({
              id: t.id,
              type: "function",
              function: { name: t.name, arguments: t.args },
            }));

          if (!toolCalls.length) break;

          // Le modèle a demandé des appels d'outils : on ajoute son message
          // assistant (avec tool_calls) à la conv, puis on exécute chaque outil
          // et on injecte les résultats avant de relancer Groq.
          conv = [
            ...conv,
            {
              role: "assistant",
              content: fullText,
              tool_calls: toolCalls,
            },
          ];

          for (const tc of toolCalls) {
            send({
              type: "tool_call",
              name: tc.function.name,
              args: safeParseArgs(tc.function.arguments),
            });
            const result = await executeTool(
              tc.function.name,
              tc.function.arguments,
              { userLocation: parsed.userLocation },
            );
            // Émet le résultat brut au client pour l'UI (panneau de sources, etc.).
            // Le LLM reçoit la même chose via le message `tool` ci-dessous.
            try {
              send({
                type: "tool_result",
                name: tc.function.name,
                result: JSON.parse(result),
              });
            } catch {
              // résultat non-JSON : on n'envoie rien à l'UI
            }
            conv = [
              ...conv,
              { role: "tool", content: result, tool_call_id: tc.id },
            ];
          }
        }

        controller.close();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Erreur serveur inconnue";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "delta", text: `\n\n⚠️ ${message}` })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function safeParseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return raw;
  }
}
