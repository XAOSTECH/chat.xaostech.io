/**
 * XAOS Chat — Dual-mode chat (AI + Social)
 */

// Tab switching
const tabButtons = document.querySelectorAll(".tab-button");
const tabContents = document.querySelectorAll(".tab-content");

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tabName = button.getAttribute("data-tab");

    // Persist active tab
    localStorage.setItem('xaos_selected_tab', tabName);

    // Update active tab button
    tabButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");

    // Update active tab content
    tabContents.forEach((content) => content.classList.remove("active"));
    document.getElementById(tabName).classList.add("active");
  });
});

// Restore selected tab on load
(function restoreSelectedTab() {
  const tab = localStorage.getItem('xaos_selected_tab');
  if (tab) {
    const btn = Array.from(tabButtons).find(b => b.getAttribute('data-tab') === tab);
    if (btn) btn.click();
  }
})();

// ============================================================
// AI Chat Mode
// ============================================================

const aiMessages = document.getElementById("ai-messages");
const aiInput = document.getElementById("ai-input");
const aiSend = document.getElementById("ai-send");
const aiTyping = document.getElementById("ai-typing");

let aiChatHistory = [
  {
    role: "assistant",
    content:
      "Hello! I'm an AI assistant powered by Cloudflare Workers AI. Ask me anything!",
  },
];
let aiProcessing = false;

// Auto-resize textarea
aiInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
});

// Send on Enter (without Shift)
aiInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendAIMessage();
  }
});

aiSend.addEventListener("click", sendAIMessage);

async function sendAIMessage() {
  const message = aiInput.value.trim();

  if (message === "" || aiProcessing) return;

  aiProcessing = true;
  aiInput.disabled = true;
  aiSend.disabled = true;

  // Add user message
  addAIMessage("user", message);

  // Clear input
  aiInput.value = "";
  aiInput.style.height = "auto";

  // Show typing
  aiTyping.classList.add("visible");

  // Add to history
  aiChatHistory.push({ role: "user", content: message });

  try {
    // Create assistant response element
    const assistantMessageEl = document.createElement("div");
    assistantMessageEl.className = "message assistant-message";
    assistantMessageEl.innerHTML = "<p></p>";
    aiMessages.appendChild(assistantMessageEl);
    aiMessages.scrollTop = aiMessages.scrollHeight;

    // Send to API
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: aiChatHistory,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to get response");
    }

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let responseText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      responseText += chunk;
      assistantMessageEl.querySelector("p").textContent = responseText;
      aiMessages.scrollTop = aiMessages.scrollHeight;
    }

    aiChatHistory.push({ role: "assistant", content: responseText });
  } catch (error) {
    console.error("AI chat error");
    addAIMessage("assistant", "Sorry, there was an error processing your request.");
  } finally {
    aiTyping.classList.remove("visible");
    aiProcessing = false;
    aiInput.disabled = false;
    aiSend.disabled = false;
    aiInput.focus();
  }
}

function addAIMessage(role, content) {
  const messageEl = document.createElement("div");
  messageEl.className = `message ${role}-message`;
  const p = document.createElement("p");
  p.textContent = content;
  messageEl.appendChild(p);
  aiMessages.appendChild(messageEl);
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

// ============================================================
// Social Chat Mode
// ============================================================

const socialMessages = document.getElementById("social-messages");
const socialInput = document.getElementById("social-input");
const socialSend = document.getElementById("social-send");
const roomSelect = document.getElementById("room-select");
const userIdInput = document.getElementById("user-id");
const userNameInput = document.getElementById("user-name");

let currentRoom = null;
let socialProcessing = false;

// Fetch user info from session and populate fields
(async function loadUserFromSession() {
  try {
    const res = await fetch('https://account.xaostech.io/api/auth/me', { credentials: 'include' });
    if (res.ok) {
      const user = await res.json();
      if (user && user.id) {
        userIdInput.value = user.id;
        userNameInput.value = user.username || user.email || '';
      }
    }
  } catch (e) {
    // Not logged in or CORS issue - user can enter manually
    console.log('Could not fetch user session');
  }
})();

// Auto-resize textarea
socialInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
});

// Send on Enter (without Shift)
socialInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendSocialMessage();
  }
});

socialSend.addEventListener("click", sendSocialMessage);

// Load room messages when room is selected
roomSelect.addEventListener("change", async (e) => {
  currentRoom = e.target.value;
  localStorage.setItem('xaos_selected_room', currentRoom || '');
  if (!currentRoom) {
    socialMessages.innerHTML = '<p style="color:var(--text-light);">Please select a room.</p>';
    return;
  }

  try {
    socialMessages.innerHTML = "";
    const response = await fetch(`/api/chat/rooms/${currentRoom}`);

    if (!response.ok) {
      // Don't attempt to parse non-OK responses as JSON
      socialMessages.innerHTML = "<p style='color:red;'>Failed to load room.</p>";
      return;
    }

    const contentType = response.headers.get('content-type') || '';

    // Protect against non-JSON responses (e.g., HTML error pages)
    if (!contentType.includes('application/json')) {
      socialMessages.innerHTML = "<p style='color:red;'>Failed to load room.</p>";
      return;
    }

    let messages = [];
    try {
      messages = await response.json();
    } catch (parseErr) {
      // Defensive: if parsing fails, treat as empty room rather than throwing
      socialMessages.innerHTML = "<p style='color:red;'>Failed to load room.</p>";
      return;
    }

    if (!Array.isArray(messages)) {
      socialMessages.innerHTML = "<p style='color:var(--text-light);'>No messages yet.</p>";
      return;
    }

    messages.forEach((msg) => {
      addSocialMessage(msg.username, msg.content, msg.timestamp);
    });
  } catch (err) {
    // Keep error reporting minimal — don't expose internals to the UI
    console.error("Failed to load room");
    socialMessages.innerHTML = "<p style='color:red;'>Failed to load room.</p>";
  }
});



// On load: restore selected room and auto-open
(function restoreSelectedRoom() {
  const remembered = localStorage.getItem('xaos_selected_room');
  if (remembered) {
    // Ensure option exists
    let opt = Array.from(roomSelect.options).find(o => o.value === remembered);
    if (!opt) {
      const newOpt = document.createElement('option');
      newOpt.value = remembered;
      newOpt.text = remembered;
      roomSelect.appendChild(newOpt);
    }
    roomSelect.value = remembered;
    roomSelect.dispatchEvent(new Event('change'));
  }
})();

async function sendSocialMessage() {
  if (!currentRoom) {
    alert("Please select a room first");
    return;
  }

  const message = socialInput.value.trim();
  const userId = userIdInput.value.trim();
  const userName = userNameInput.value.trim();

  if (message === "" || !userId || !userName || socialProcessing) return;

  socialProcessing = true;
  socialInput.disabled = true;
  socialSend.disabled = true;

  try {
    const response = await fetch(`/api/chat/rooms/${currentRoom}/post`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        username: userName,
        content: message,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to post message");
    }

    addSocialMessage(userName, message, new Date().toISOString());
    socialInput.value = "";
    socialInput.style.height = "auto";
    socialInput.focus();
  } catch (error) {
    console.error("Failed to post message");
    alert("Failed to post message");
  } finally {
    socialProcessing = false;
    socialInput.disabled = false;
    socialSend.disabled = false;
  }
}

function addSocialMessage(author, content, timestamp) {
  const messageEl = document.createElement("div");
  messageEl.className = "message room-message";
  const time = new Date(timestamp).toLocaleTimeString();

  const authorEl = document.createElement("div");
  authorEl.className = "message-author";
  authorEl.textContent = author;

  const contentEl = document.createElement("p");
  contentEl.textContent = content;

  const timeEl = document.createElement("div");
  timeEl.className = "message-time";
  timeEl.textContent = time;

  messageEl.appendChild(authorEl);
  messageEl.appendChild(contentEl);
  messageEl.appendChild(timeEl);

  socialMessages.appendChild(messageEl);
  socialMessages.scrollTop = socialMessages.scrollHeight;
}

// Theme handling
const themeToggleBtn = document.getElementById('theme-toggle');
function applyTheme(theme) {
  if (theme === 'dark') document.body.classList.add('dark');
  else document.body.classList.remove('dark');
  localStorage.setItem('xaos_theme', theme);
}

themeToggleBtn.addEventListener('click', () => {
  const isDark = document.body.classList.toggle('dark');
  applyTheme(isDark ? 'dark' : 'light');
  // Update icon
  themeToggleBtn.textContent = isDark ? '☀️' : '🌗';
});

// Initialize theme from localStorage
(function initTheme() {
  const saved = localStorage.getItem('xaos_theme') || 'light';
  applyTheme(saved);
  themeToggleBtn.textContent = (saved === 'dark') ? '☀️' : '🌗';
})();