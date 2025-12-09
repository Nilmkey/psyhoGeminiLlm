import React, { useState, useEffect, useRef } from "react";
import "./global.css"; // Создайте этот файл для стилей ниже

// Адрес вашего бэкенда (работает на том же порту)
const API_URL = "http://localhost:3000";

// ---------------------------------------------------------------------
// --- ГЛАВНЫЙ КОМПОНЕНТ ПРИЛОЖЕНИЯ ЧАТБОТА (Чат на основе RAG) ---
// ---------------------------------------------------------------------

function ChatbotApp() {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Автоматическая прокрутка вниз
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Инициализация сессии при загрузке
  useEffect(() => {
    const storedSessionId = localStorage.getItem("chatbotSessionId");
    if (storedSessionId) {
      setSessionId(storedSessionId);
    } else {
      fetch(`${API_URL}/api/session`, { method: "GET" })
        .then((res) => res.json())
        .then((data) => {
          setSessionId(data.sessionId);
          localStorage.setItem("chatbotSessionId", data.sessionId);
        })
        .catch((err) => console.error("Ошибка получения сессии:", err));
    }
  }, []);

  // Прокрутка при добавлении нового сообщения
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 2. Функция отправки запроса на бэкенд
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !sessionId) return;

    const userQuery = input.trim();
    setInput("");
    setIsLoading(true);

    // Добавляем сообщение пользователя в UI
    setMessages((prev) => [...prev, { role: "user", text: userQuery }]);

    try {
      const response = await fetch(`${API_URL}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: userQuery, sessionId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Формируем ответ для отображения
      const botMessage = {
        role: "model",
        text: data.answer,
        sources: data.sources || [],
      };

      // Добавляем ответ бота в UI
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Ошибка при отправке запроса:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          text: "Произошла ошибка при получении ответа. Проверьте соединение с сервером.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Компонент для отображения одного сообщения
  const Message = ({ message }) => {
    const isUser = message.role === "user";
    const isSystem = message.role === "system";

    return (
      <div
        className={`message ${isUser ? "user-message" : "bot-message"} ${
          isSystem ? "system-message" : ""
        }`}
      >
        <div className="message-content">
          <p>{message.text}</p>
          {message.sources && message.sources.length > 0 && (
            <div className="sources-container">
              <details>
                <summary>Источники ({message.sources.length})</summary>
                <ul>
                  {message.sources.map((src, index) => (
                    <li key={index}>
                      <strong>Сходство:</strong> {src.similarity} |
                      <strong>Текст:</strong> "{src.text.substring(0, 100)}..."
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </div>
      </div>
    );
  };

  // 4. Рендеринг
  if (!sessionId) {
    return (
      <div className="chatbot-container loading-state">Загрузка сессии...</div>
    );
  }

  return (
    <div className="chatbot-container">
      <header className="glass-header">
        <h2>Психологический RAG-Консультант</h2>
        <small>Session ID: {sessionId.substring(0, 8)}...</small>
      </header>

      <div className="chat-area">
        {messages.length === 0 && (
          <div className="welcome-message">
            Здравствуйте! Я ваш психологический RAG-консультант. Спрашивайте,
            используя нашу базу знаний.
          </div>
        )}

        {messages.map((msg, index) => (
          <Message key={index} message={msg} />
        ))}

        {isLoading && (
          <div className="loading-dots bot-message">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Задайте вопрос..."
          disabled={isLoading}
          className="glass-input"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="glass-button"
        >
          {isLoading ? "Отправка..." : "Отправить"}
        </button>
      </form>
    </div>
  );
}

export default ChatbotApp;
