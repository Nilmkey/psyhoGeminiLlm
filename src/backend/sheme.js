import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const MONGO_URL = process.env["MONGO_URL"];

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, required: true, enum: ["user", "model"] },
    parts: [{ text: { type: String, required: true } }],
  },
  { _id: false }
);
const dialogSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    history: [messageSchema],
  },
  { timestamps: true }
);

export default async function connectToMongo() {
  try {
    await mongoose.connect(MONGO_URL);
    console.log("MongoDB Connected Successfully.");
  } catch (err) {
    console.error("MongoDB Connection Error:", err.message);
    // В случае ошибки подключения, приложение может завершиться или работать без персистентности
  }
}

export const Dialog = mongoose.model("Dialog", dialogSchema);
