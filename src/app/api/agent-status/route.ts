export function GET() {
  const apiKeySet = Boolean(process.env.DEEPSEEK_API_KEY);
  return Response.json({
    engine: apiKeySet ? "deepseek-llm" : "deterministic-fallback",
    apiKeySet,
    provider: apiKeySet ? "DeepSeek (chat)" : "heuristics",
  });
}
