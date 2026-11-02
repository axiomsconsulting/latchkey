/** The AI gateway's streamed answers (server side): shared by the features that call it. */

/** Reads an SSE stream and returns the finished text. */
export async function readAiStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: string; text?: string };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string")
          text += event.delta;
        if (event.type === "response.output_text.done" && typeof event.text === "string" && !text)
          text = event.text;
      } catch {
        // partial frame: ignore and wait for the rest
      }
    }
  }
  return text;
}
