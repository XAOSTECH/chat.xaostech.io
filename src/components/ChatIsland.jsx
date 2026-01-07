import { useEffect, useRef, useState } from 'preact/hooks';
import { h } from 'preact';

export default function ChatIsland() {
  const [currentRoom, setCurrentRoom] = useState('general');
  const [messages, setMessages] = useState([]);
  const [aiMessages, setAiMessages] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const aiInputRef = useRef(null);
  const socialInputRef = useRef(null);

  // Fetch current user on mount
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Restore selected room
    const remembered = localStorage.getItem('xaos_selected_room');
    if (remembered) setCurrentRoom(remembered);
  }, []);

  useEffect(() => {
    // Load room messages
    if (currentRoom) {
      fetch(`/api/chat/rooms/${currentRoom}`)
        .then((r) => r.json())
        .then((data) => setMessages(data || []))
        .catch((e) => console.error('Failed loading room', e));
    }
    localStorage.setItem('xaos_selected_room', currentRoom || '');
  }, [currentRoom]);

  async function sendSocialMessage() {
    const content = socialInputRef.current.value.trim();
    if (!content || !currentRoom) return;
    
    const userId = currentUser?.id || 'guest';
    const username = currentUser?.username || 'Guest';
    const avatar_url = currentUser?.avatar_url || null;
    
    await fetch(`/api/chat/rooms/${currentRoom}/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId, username, content, avatar_url }),
    });
    socialInputRef.current.value = '';
    const now = new Date().toISOString();
    setMessages((m) => m.concat([{ username, content, timestamp: now, avatar_url }]));
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

  const defaultAvatar = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="35" r="25" fill="%23666"/><ellipse cx="50" cy="90" rx="40" ry="30" fill="%23666"/></svg>';

  return (
    <div>
      {/* User status bar */}
      <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
        {currentUser ? (
          <>
            <img 
              src={currentUser.avatar_url || defaultAvatar} 
              alt={currentUser.username} 
              style={{ width: 32, height: 32, borderRadius: '50%' }} 
            />
            <span>Logged in as <strong>{currentUser.username}</strong></span>
          </>
        ) : (
          <span style={{ color: '#666' }}>
            Chatting as Guest — <a href="/api/auth/github/login">Login with GitHub</a> for your avatar
          </span>
        )}
      </div>

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
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 12, display: 'flex', gap: 10 }}>
              <img 
                src={m.avatar_url || defaultAvatar} 
                alt={m.username} 
                style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} 
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.username}</div>
                <div>{m.content}</div>
                <div style={{ fontSize: 11, color: '#999' }}>{new Date(m.timestamp).toLocaleString()}</div>
              </div>
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