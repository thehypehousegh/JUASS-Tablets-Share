import { useEffect, useRef, useState } from "react";
import { apiGet, apiSend, ApiError } from "../api";

interface Contact {
  id: string;
  name: string;
  role: string;
  unread: number;
}

interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
}

export default function Chat() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadContacts() {
    try {
      setContacts(await apiGet("/chat/contacts"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load contacts");
    }
  }

  useEffect(() => {
    loadContacts();
    const interval = setInterval(loadContacts, 20000);
    return () => clearInterval(interval);
  }, []);

  async function openThread(c: Contact) {
    setSelected(c);
    try {
      setMessages(await apiGet(`/chat/thread/${c.id}`));
      loadContacts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load messages");
    }
  }

  useEffect(() => {
    if (!selected) return;
    const interval = setInterval(async () => {
      try {
        setMessages(await apiGet(`/chat/thread/${selected.id}`));
      } catch {
        // ignore transient failures while polling
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !draft.trim()) return;
    try {
      const msg = await apiSend("POST", `/chat/thread/${selected.id}`, { body: draft.trim() });
      setMessages((m) => [...m, msg]);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send message");
    }
  }

  return (
    <div className="page chat-page">
      <h2>Internal Chat</h2>
      {error && <p className="error-text">{error}</p>}
      <div className="chat-layout">
        <div className="chat-contacts">
          {contacts.map((c) => (
            <button
              key={c.id}
              className={`chat-contact ${selected?.id === c.id ? "active" : ""}`}
              onClick={() => openThread(c)}
            >
              <span>{c.name}</span>
              <span className="contact-role">{c.role.replace("_", " ").toLowerCase()}</span>
              {c.unread > 0 && <span className="badge badge-warn">{c.unread}</span>}
            </button>
          ))}
        </div>
        <div className="chat-thread">
          {selected ? (
            <>
              <div className="chat-messages">
                {messages.map((m) => (
                  <div key={m.id} className={`chat-bubble ${m.recipientId === selected.id ? "sent" : "received"}`}>
                    <p>{m.body}</p>
                    <span className="chat-time">{new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <form className="chat-input-row" onSubmit={send}>
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Message ${selected.name}…`}
                />
                <button type="submit" className="btn-primary">
                  Send
                </button>
              </form>
            </>
          ) : (
            <p className="hint-text">Select someone on the left to start a conversation.</p>
          )}
        </div>
      </div>
    </div>
  );
}
