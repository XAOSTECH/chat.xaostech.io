import { useEffect, useRef, useState } from 'preact/hooks';
import { h } from 'preact';

export default function ChatIsland() {
  const [currentRoom, setCurrentRoom] = useState('general');
  const [messages, setMessages] = useState([]);
  const [aiMessages, setAiMessages] = useState([]);
  const userIdRef = useRef('user-demo');
  const userNameRef = useRef('Demo User');
  const aiInputRef = useRef(null);
  const socialInputRef = useRef(null);

  useEffect(() => {
    // Restore selected room
    const remembered = localStorage.getItem('xaos_selected_room');
    if (remembered) setCurrentRoom(remembered);
  }, []);

  useEffect(() => {
    // Load room messages
    if (currentRoom) {
      fetch(`/api/rooms/${currentRoom}`)
        .then((r) => r.json())
        .then((data) => setMessages(data || []))
        .catch((e) => console.error('Failed loading room', e));
    }
    localStorage.setItem('xaos_selected_room', currentRoom || '');
  }, [currentRoom]);

  async function sendSocialMessage() {
    const content = socialInputRef.current.value.trim();
    const userId = userIdRef.current;
    const username = userNameRef.current;
    if (!content || !currentRoom) return;
    await fetch(`/api/rooms/${currentRoom}/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username, content }),
    });
    socialInputRef.current.value = '';
    const now = new Date().toISOString();
    setMessages((m) => m.concat([{ username, content, timestamp: now }]));
  }

  async function sendAIMessage() {
    const content = aiInputRef.current.value.trim();
    if (!content) return;
    const msg = { role: 'user', content };
    aiInputRef.current.value = '';
    // stream response
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [msg] }),
      });
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let s = '';
      const aiEl = { content: '' };
      setAiMessages((a) => a.concat([aiEl]));
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        s += dec.decode(value, { stream: true });
        aiEl.content = s;
        setAiMessages((a) => a.slice().map(x => x));
      }
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <label>Room: </label>
        <select value={currentRoom} onChange={(e) => setCurrentRoom(e.target.value)}>
          <option value="general">general</option>
          <option value="random">random</option>
          <option value="announcements">announcements</option>
        </select>
      </div>

      <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8, minHeight: 300 }}>
        <div>
          {messages.map((m) => (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#666' }}>{m.username}</div>
              <div>{m.content}</div>
              <div style={{ fontSize: 11, color: '#999' }}>{new Date(m.timestamp).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input ref={socialInputRef} placeholder="Type a message..." style={{ flex: 1 }} />
        <button onClick={sendSocialMessage}>Send</button>
      </div>

      <hr style={{ margin: '1.5rem 0' }} />

      <div>
        <h3>AI Chat</h3>
        <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8, minHeight: 200 }}>
          {aiMessages.map((m, i) => (
            <div style={{ marginBottom: 8 }} key={i}>{m.content}</div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input ref={aiInputRef} placeholder="Ask the AI..." style={{ flex: 1 }} />
          <button onClick={sendAIMessage}>Ask</button>
        </div>
      </div>
    </div>
  );
}