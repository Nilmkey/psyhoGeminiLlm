import dotenv from "dotenv";
import express, { response } from "express";
import { RecursiveChunker } from "@chonkiejs/core";
import { GoogleGenAI } from "@google/genai";
import { ChromaClient } from "chromadb";
import { GoogleGeminiEmbeddingFunction } from "@chroma-core/google-gemini";
import { v4 as uuidv4 } from "uuid";
import connectToMongo, { Dialog } from "./sheme.js";
import { fileURLToPath } from "url";
import path from "path";
import DATA from "./texts.js";

dotenv.config({ path: "../../.env" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RELEVANCE_THRESHOLD = 0.5;
const TOP_K_RESULTS = 3;

const key = process.env["GEMINI_API_KEY"];
const ai = new GoogleGenAI({ apiKey: key });
const chroma = new ChromaClient({
  host: "localhost",
  port: 8000,
});
const embedder = new GoogleGeminiEmbeddingFunction({
  apiKey: key,
});

async function getContext(query, nResults = TOP_K_RESULTS) {
  const collection = await chroma.getOrCreateCollection({
    name: "PsyhologyDate",
    embeddingFunction: embedder,
  });
  const results = await collection.query({
    queryTexts: [query],
    nResults: nResults,
    include: ["documents", "metadatas", "distances"],
  });

  const chunks = results.documents[0].map((doc, i) => ({
    text: doc,
    metadata: results.metadatas[0][i],
    id: results.ids[0][i],
    distance: results.distances[0][i],
    similarity: 1 - results.distances[0][i], // чем ближе к 1, тем релевантнее
  }));

  return chunks;
}
function isRelevant(chunks) {
  if (chunks.length === 0) return false;
  return chunks[0].similarity >= RELEVANCE_THRESHOLD;
}

async function ask(query, sessionId) {
  const chunks = await searchRelevantChunks(query);
  const history = await getHistory(sessionId);

  if (!isRelevant(chunks)) {
    const response = {
      answer: "В базе знаний нет информации для ответа на этот вопрос.",
      sources: [],
      hasRelevantInfo: false,
    };
    history.push(
      { role: "user", parts: [{ text: query }] },
      { role: "model", parts: [{ text: response.answer }] }
    );
    await setHistory(sessionId, history);
    return response;
  }

  const relevantChunks = chunks.filter(
    (chunk) => chunk.similarity >= RELEVANCE_THRESHOLD
  );

  const answer = await askGemini(query, relevantChunks, history);

  const finalResponse = {
    answer: answer,
    sources: relevantChunks.map((chunk, i) => ({
      number: i + 1,
      text: chunk.text,
      metadata: chunk.metadata,
      similarity: chunk.similarity.toFixed(3),
    })),
    hasRelevantInfo: true,
  };

  history.push(
    { role: "user", parts: [{ text: query }] },
    { role: "model", parts: [{ text: finalResponse.answer }] }
  );
  await setHistory(sessionId, history);

  return finalResponse;
}

//функция для нейростеик с промптом
async function askGemini(query, relevantChunks, history = []) {
  // <-- Принимает history
  const context = relevantChunks
    .map((chunk, i) => `[Источник ${i + 1}]:\n${chunk.text}`)
    .join("\n\n");

  const systemInstruction = `Ты — психологический консультант, который отвечает исключительно на основе предоставленного контекста. 
Твоя задача — использовать данные из КОНТЕКСТА, чтобы поддержать человека, показать понимание его состояния и дать аккуратные рекомендации, если они присутствуют в источниках.
КОНТЕКСТ:
${context}
ИНСТРУКЦИИ:
- Полагайся на то, что есть в КОНТЕКСТЕ и предыдущем диалоге.
- Весь КОНТЕНТ который тебе передается с запросом тоже считается за КОНТЕКСТ
- Если информации не хватает, посмотри ответ в контенте, в крайнем случае ответь фразой: советом к походу к психологу.
- Если используешь данные из КОНТЕКСТА, указывай источник в виде [Источник N].
- Общайся бережно, спокойно и профессионально.
- Не делай выводов, которых нет в КОНТЕКСТЕ.
- На благодарность отвечай тоже благодарностью
- Не давай клинических диагнозов.
- Если вопрос предполагает поддержку, сначала отрази эмоции пользователя, но только если это подтверждается КОНТЕКСТОМ.
`;

  // Новое сообщение пользователя
  const userMessage = { role: "user", parts: [{ text: `ВОПРОС: ${query}` }] };

  // Комбинируем историю и текущий вопрос
  const contents = [...history, userMessage];

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: contents, // Передаем всю историю
    config: {
      systemInstruction: systemInstruction, // Используем системную инструкцию
    },
  });

  return response.text;
}

async function getEmbedding(text) {
  const response = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
  });
}

// Поиск релевантных чанков
async function searchRelevantChunks(query, nResults = TOP_K_RESULTS) {
  const collection = await chroma.getOrCreateCollection({
    name: "PsyhologyDate",
    embeddingFunction: embedder,
  });
  const results = await collection.query({
    queryTexts: [query],
    nResults: nResults,
    include: ["documents", "metadatas", "distances"],
  });

  // Преобразуем distance в similarity score (0-1)
  const chunks = results.documents[0].map((doc, i) => ({
    text: doc,
    metadata: results.metadatas[0][i],
    id: results.ids[0][i],
    distance: results.distances[0][i],
    similarity: 1 - results.distances[0][i], // чем ближе к 1, тем релевантнее
  }));

  console.log("DEBUG: Результаты поиска для запроса:", query);
  console.table(
    chunks.map((c) => ({
      Similarity: c.similarity.toFixed(4),
      Distance: c.distance.toFixed(4),
      Text: c.text.substring(0, 50) + "...",
    }))
  );

  return chunks;
}

async function getHistory(sessionId) {
  const dialog = await Dialog.findOne({ sessionId });
  return dialog ? dialog.history : [];
}

async function setHistory(sessionId, history) {
  await Dialog.findOneAndUpdate(
    { sessionId: sessionId },
    { history: history },
    { upsert: true, new: true }
  );
}

// Проверка релевантности

const chunky = async (text) => {
  return await (
    await (async () => {
      const chunker = await RecursiveChunker.create({
        chunkSize: 1000,
        minCharactersPerChunk: 100,
      });

      const originalchunk = chunker.chunk.bind(chunker);

      chunker.chunk = async function (text) {
        let chunks = [];

        for (const s of text
          .replace(/\s+/g, " ")
          .replace(/[\t\r]/g, " ")
          .replace(/\n{2,}/g, "\n")
          .trim()
          .split(/\n\s*\n+/)
          .map((t) => t.trim())
          .filter(Boolean))
          chunks = chunks.concat(await originalchunk(s));

        return chunks;
      };

      return chunker;
    })()
  ).chunk(text);
};

// (async () => {
//   const collection = await chroma.getOrCreateCollection({
//     name: "PsyhologyDate",
//     embeddingFunction: embedder,
//   });
//   let globalIndex = 0;
//   for (const text of DATA) {
//     const chunks = await chunky(text);
//     await collection.add({
//       ids: chunks.map((_, i) => `chunk_${globalIndex++}`),
//       documents: chunks.map((c) => c.text),
//       metadatas: chunks.map((c) => ({
//         startIndex: c.startIndex,
//         endIndex: c.endIndex,
//         tokenCount: c.tokenCount,
//       })),
//     });
//   }

//   const response = await ask("что такое буллинг?");
//   console.log("ответ: ", response);
// })();

const app = express();
app.use(express.json());

app.get("/api/session", (req, res) => {
  const sessionId = uuidv4();
  return res.status(200).json({ sessionId: sessionId });
});

// app.post("/api/uploadDate", (req, res) => {});
app.post("/api/ask", async (req, res) => {
  const body = req.body;
  if (!body || !body.data || typeof body.data !== "string" || !body.sessionId) {
    return res.status(400).json({
      error: "Bad Request: 'data' and 'sessionId' fields are required.",
    });
  }
  try {
    const query = body.data.trim();
    const sessionId = body.sessionId; // <-- Получаем ID сессии

    const response = await ask(query, sessionId); // <-- Передаем ID сессии

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error processing /api/ask:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.use(express.static(path.join(__dirname, "../../dist")));
app.use((_req, res) => {
  res.status(200).sendFile(path.join(__dirname, "../../dist/index.html"));
});

app.listen(3000, () => {
  console.log("start");
  (async () => {
    await connectToMongo();
  })();
});
