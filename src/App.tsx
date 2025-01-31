import React, { useState, useRef, useEffect, useCallback } from "react";
// @ts-ignore
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
// @ts-ignore
import { okaidia } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Send, StopCircle } from "lucide-react";
import "./App.css"

interface Message {
  sender: string;
  content: string;
}

interface CodeBlockProps {
  code: string;
  language: string;
}

const CodeBlockWithCopy: React.FC<CodeBlockProps> = ({ code, language }) => {
  const [_, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-4">
      <SyntaxHighlighter
        language={language || "javascript"}
        style={okaidia}
        customStyle={{
          margin: 0,
          borderRadius: "6px",
          padding: "1rem",
          backgroundColor: "#1a1a1a",
        }}
      >
        {code.trim()}
      </SyntaxHighlighter>
      <button
        className="absolute top-2 right-2 p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
        onClick={handleCopy}
      >
        <Copy className="w-4 h-4" />
      </button>
    </div>
  );
};

const renderMessageContent = (content: string) => {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/;
  const codeRegex = /```(\w*)\n([\s\S]*?)```/;
  const listRegex = /(^|\n)(\*|\-|\d+\.)\s+(.*?)(?=\n|$)/g;

  const thinkMatch = content.match(thinkRegex);
  const codeMatch = content.match(codeRegex);

  const formatListContent = (content: string) => {
    return content.replace(listRegex, (_, p1, p2, p3) => {
      const isOrdered = /\d+\./.test(p2);
      const listTag = isOrdered ? "ol" : "ul";
      return `${p1}<${listTag} class="list-inside ${
        isOrdered ? "list-decimal" : "list-disc"
      } my-2 text-gray-300"><li>${p3}</li></${listTag}>`;
    });
  };

  const formattedContent = formatListContent(content);

  return (
    <div className="text-gray-300">
      {thinkMatch && (
        <div className="bg-[#1a1a1a] p-3 rounded-lg mb-3">
          <span>🤔 {thinkMatch[1].trim()}</span>
        </div>
      )}

      {codeMatch && (
        <CodeBlockWithCopy code={codeMatch[2]} language={codeMatch[1]} />
      )}

      <div
        className="prose prose-invert max-w-none"
        dangerouslySetInnerHTML={{
          __html: thinkMatch
            ? formattedContent.replace(/<think>[\s\S]*?<\/think>/, "").trim()
            : formattedContent,
        }}
      />
    </div>
  );
};

const Home: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [model, setModel] = useState("deepseek-r1:8b");
  const contentRef = useRef<HTMLDivElement>(null);
  // const _ = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (input.trim() === "" || isStreaming) return;

    const userMessage = { sender: "user", content: input };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInput("");
    setIsStreaming(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model,
          prompt: input,
          stream: true,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let botResponse = "";
      let currentThink = "";
      let isProcessingThink = false;

      setMessages((prevMessages) => [
        ...prevMessages,
        { sender: "bot", content: "" },
      ]);

      while (true) {
        const { done, value } = (await reader?.read()) || {};
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsedLine = JSON.parse(line);
              if (parsedLine.response) {
                const response = parsedLine.response;

                if (response.includes("<think>") && !isProcessingThink) {
                  isProcessingThink = true;
                  currentThink = response.split("<think>")[1];
                } else if (isProcessingThink) {
                  if (response.includes("</think>")) {
                    currentThink += response.split("</think>")[0];
                    isProcessingThink = false;
                  } else {
                    currentThink += response;
                  }
                }

                botResponse += response;

                setMessages((prevMessages) => {
                  const updatedMessages = [...prevMessages];
                  const content = isProcessingThink
                    ? `<think>${currentThink}</think>`
                    : currentThink
                    ? `<think>${currentThink}</think>${botResponse.replace(
                        /<think>[\s\S]*?<\/think>/,
                        ""
                      )}`
                    : botResponse;

                  updatedMessages[updatedMessages.length - 1] = {
                    sender: "bot",
                    content: content,
                  };
                  return updatedMessages;
                });
              }
            } catch (parseError) {
              console.error("Error parsing stream:", parseError);
            }
          }
        }
      }

      setIsStreaming(false);
    } catch (error) {
      console.error("Error fetching response:", error);

      if (error instanceof DOMException && error.name === "AbortError") {
        setMessages((prevMessages) => [
          ...prevMessages,
          { sender: "bot", content: "Response streaming was cancelled." },
        ]);
      } else {
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            sender: "bot",
            content: "An error occurred while fetching the response.",
          },
        ]);
      }

      setIsStreaming(false);
    }
  }, [input, isStreaming, model]);

  const handleAbortStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e]">
      <header className="bg-[#1e1e1e] border-b border-gray-800">
        <div className="px-4 py-2 flex justify-between items-center">
          <h1 className="text-xl text-white">Easy AI</h1>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="bg-[#1e1e1e] text-gray-300 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-600"
          >
            <option value="deepseek-r1:8b">deepseek-r1:8b</option>
            <option value="deepseek-r1:1.5b">deepseek-r1:1.5b</option>
            <option value="deepseek-r1:14b">deepseek-r1:14b</option>
            <option value="deepseek-r1:32b">deepseek-r1:32b</option>
            <option value="deepseek-r1:70b">deepseek-r1:70b</option>
            <option value="deepseek-r1:671b">deepseek-r1:671b</option>
          </select>
        </div>
      </header>

      <div ref={contentRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((msg, index) => (
          <div key={index} className="mb-6">
            <div className="flex items-start gap-2">
              <div className="font-medium text-gray-300 mb-1 min-w-[30px]">
                {msg.sender === "user" ? "You" : "AI"}
              </div>
              <div className="flex-1">{renderMessageContent(msg.content)}</div>
            </div>
          </div>
        ))}
      </div>

      <footer className="border-t border-gray-800 bg-[#1e1e1e] p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isStreaming}
            placeholder="Message Easy AI..."
            className="flex-1 bg-[#1e1e1e] text-gray-300 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-600 placeholder-gray-600"
          />
          {isStreaming ? (
            <button
              onClick={handleAbortStreaming}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={`px-4 py-2 rounded ${
                input.trim()
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="mt-2 text-center text-xs text-gray-600">
          Easy AI can make mistakes. Consider checking important information.
        </div>
      </footer>
    </div>
  );
};

export default Home;