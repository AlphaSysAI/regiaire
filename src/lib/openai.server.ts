import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY manquante");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getIAGeneratedVerdict(prompt: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 120,
  });

  return completion.choices[0].message.content?.trim();
}