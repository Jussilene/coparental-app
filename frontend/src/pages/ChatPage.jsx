import { Check, CheckCheck, Download, FileAudio, FileText, Paperclip, SendHorizonal, Video, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, getUploadUrl } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

function getAttachmentKind(name = "") {
  const lowerName = String(name || "").toLowerCase();
  if (/\.(jpg|jpeg|png|webp|gif)$/i.test(lowerName)) {
    return "image";
  }
  if (/\.(mp4|webm|mov)$/i.test(lowerName)) {
    return "video";
  }
  if (/\.(mp3|wav|ogg|m4a|aac)$/i.test(lowerName)) {
    return "audio";
  }
  return "document";
}

function getAttachmentLabel(kind) {
  if (kind === "image") {
    return "Foto pronta para envio";
  }
  if (kind === "video") {
    return "Video pronto para envio";
  }
  if (kind === "audio") {
    return "Audio pronto para envio";
  }
  return "Documento pronto para envio";
}

function ChatAttachment({ message }) {
  if (!message.attachment_path) {
    return null;
  }

  const fileName = message.attachment_name || "Arquivo";
  const kind = getAttachmentKind(fileName);
  const previewUrl = getUploadUrl(message.attachment_path, fileName, { download: false });
  const downloadUrl = getUploadUrl(message.attachment_path, fileName);

  if (kind === "image") {
    return (
      <a className="chat-attachment-media-link" href={previewUrl} target="_blank" rel="noreferrer">
        <img className="chat-attachment-image" src={previewUrl} alt={fileName} />
      </a>
    );
  }

  if (kind === "video") {
    return (
      <video className="chat-attachment-video" controls preload="metadata">
        <source src={previewUrl} />
        Seu navegador nao suporta video incorporado.
      </video>
    );
  }

  if (kind === "audio") {
    return (
      <div className="chat-attachment-audio-wrap">
        <audio className="chat-attachment-audio" controls preload="metadata">
          <source src={previewUrl} />
          Seu navegador nao suporta audio incorporado.
        </audio>
      </div>
    );
  }

  return (
    <a className="chat-attachment-file" href={downloadUrl}>
      <span className="chat-attachment-file-icon">
        {kind === "audio" ? <FileAudio size={18} /> : <FileText size={18} />}
      </span>
      <span className="chat-attachment-file-copy">
        <strong>{fileName}</strong>
        <small>Toque para abrir ou baixar</small>
      </span>
      <Download size={16} />
    </a>
  );
}

export function ChatPage() {
  const { user, familyContext, refreshNotifications } = useAuth();
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);
  const chatListRef = useRef(null);
  const previousLastMessageIdRef = useRef(null);

  const selectedAttachments = useMemo(() => attachments.map((file, index) => ({
    id: `${file.name}-${file.size}-${index}`,
    file,
    kind: getAttachmentKind(file.name)
  })), [attachments]);

  async function load() {
    try {
      await api("/api/chat/read", { method: "POST", body: JSON.stringify({}) });
      const data = await api("/api/chat");
      setMessages(data.messages);
      await refreshNotifications();
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  useEffect(() => {
    setFeedback("");
    setError("");
    load();
    const timer = setInterval(load, 2000);

    function handleFocus() {
      load();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        load();
      }
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [familyContext?.family?.id]);

  useEffect(() => {
    const chatList = chatListRef.current;
    const lastMessageId = messages.at(-1)?.id || null;
    if (!chatList || !lastMessageId) {
      previousLastMessageIdRef.current = lastMessageId;
      return;
    }

    if (previousLastMessageIdRef.current !== lastMessageId) {
      chatList.scrollTo({ top: chatList.scrollHeight, behavior: "smooth" });
      previousLastMessageIdRef.current = lastMessageId;
    }
  }, [messages]);

  function handleSelectAttachments(event) {
    const nextFiles = Array.from(event.target.files || []);
    if (!nextFiles.length) {
      return;
    }
    setAttachments((current) => [...current, ...nextFiles]);
    event.target.value = "";
  }

  function removeAttachment(targetId) {
    setAttachments((current) => current.filter((file, index) => `${file.name}-${file.size}-${index}` !== targetId));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!content.trim() && !attachments.length) {
      setError("Escreva uma mensagem ou selecione pelo menos um anexo.");
      return;
    }

    const formData = new FormData();
    if (content.trim()) {
      formData.append("content", content.trim());
    }
    for (const file of attachments) {
      formData.append("attachments", file);
    }

    try {
      setSending(true);
      setError("");
      await api("/api/chat", { method: "POST", body: formData });
      setContent("");
      setAttachments([]);
      setFeedback(attachments.length ? "Anexo enviado com sucesso." : "Mensagem enviada com sucesso.");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await load();
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page page-base44 chat-page">
      <div className="page-header hero-header">
        <div>
          <h1>Chat</h1>
          <p>Comunicação registrada entre os responsáveis</p>
        </div>
      </div>

      <section className="card chat-card base44-chat-card">
        {error ? <div className="alert error">{error}</div> : null}
        {feedback ? <div className="alert success">{feedback}</div> : null}
        <div ref={chatListRef} className="chat-list">
          {messages.map((message) => (
            <div key={message.id} className={`chat-bubble ${message.sender_id === user.id ? "mine" : ""}`}>
              {message.content ? <p>{message.content}</p> : null}
              {!message.content && message.attachment_path ? <p className="chat-attachment-label">Arquivo enviado</p> : null}
              <ChatAttachment message={message} />
              <small className="chat-bubble-meta">
                <span>{new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                {message.sender_id === user.id ? (
                  message.read_at
                    ? <CheckCheck size={16} strokeWidth={2.4} className="chat-read-icon read" />
                    : <Check size={15} strokeWidth={2.4} className="chat-read-icon" />
                ) : null}
              </small>
            </div>
          ))}
        </div>
        {selectedAttachments.length ? (
          <div className="chat-attachment-preview-list">
            {selectedAttachments.map(({ id, file, kind }) => (
              <div key={id} className="chat-attachment-preview">
                <span className="chat-attachment-preview-icon">
                  {kind === "video" ? <Video size={16} /> : kind === "audio" ? <FileAudio size={16} /> : <Paperclip size={16} />}
                </span>
                <span className="chat-attachment-preview-copy">
                  <strong>{file.name}</strong>
                  <small>{getAttachmentLabel(kind)}</small>
                </span>
                <button className="ghost-button chat-attachment-clear" type="button" onClick={() => removeAttachment(id)}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <form className="chat-form base44-chat-form" onSubmit={sendMessage}>
          <label className="attach-button">
            <Paperclip size={18} />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="*/*"
              onChange={handleSelectAttachments}
            />
          </label>
          <input value={content} onChange={(event) => setContent(event.target.value)} placeholder="Digite sua mensagem..." />
          <button className="gradient-cta icon-only" type="submit" disabled={sending}><SendHorizonal size={18} /></button>
        </form>
        <small className="chat-footnote">Todas as mensagens sao registradas e podem ser usadas como documentacao</small>
      </section>
    </div>
  );
}
