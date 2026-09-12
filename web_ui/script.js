/* Scroll Animation Observer (AOS) */
const observerOptions = {
    root: document.querySelector('.scroll-container'),
    rootMargin: '0px',
    threshold: 0.15
};

const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('aos-animate');
        }
    });
}, observerOptions);

document.addEventListener('DOMContentLoaded', () => {
    const aosElements = document.querySelectorAll('[data-aos]');
    aosElements.forEach(el => observer.observe(el));
});

/* Start Button */
document.getElementById('startButton').addEventListener('click', async () => {
    const btn = document.getElementById('startButton');
    btn.textContent = 'Initializing...';
    btn.disabled = true;

    try {
        await eel.start_gesture_control()();
        // Do NOT close window. Wait for backend to signal completion.
    } catch (err) {
        console.error("Error starting gesture control:", err);
        btn.textContent = 'Failed – Try Again';
        btn.disabled = false;
    }
});

/* Exposed function to update button status from Python */
eel.expose(set_activation_status);
function set_activation_status(message) {
    const btn = document.getElementById('startButton');
    btn.textContent = message;
    btn.style.background = 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)'; // Green for success
    // btn.disabled = false; // Optionally re-enable if needed, or keep disabled to show status
}

/* Voice Command Button */
document.getElementById('voiceButton').addEventListener('click', async () => {
    const btn = document.getElementById('voiceButton');
    const originalText = btn.textContent;
    btn.textContent = '🎤 Activating...';
    btn.disabled = true;

    try {
        await eel.activate_voice_commands()();
        btn.textContent = '🎤 Listening...';
        btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

        // Keep button disabled while listening
        setTimeout(() => {
            btn.textContent = '🎤 Voice Active';
        }, 1000);
    } catch (err) {
        console.error('Voice activation error:', err);
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

/* MedVision 3D — Open medical viewer in maximized window */
document.getElementById('openMedViewer').addEventListener('click', () => {
    const w = screen.availWidth;
    const h = screen.availHeight;
    window.open(
        'medical_viewer/index.html',
        'MedVision3D',
        `width=${w},height=${h},left=0,top=0,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no`
    );
});

/* Smart Bedside Controller — Open patient dashboard in maximized window */
document.getElementById('openPatientBoard').addEventListener('click', () => {
    const w = screen.availWidth;
    const h = screen.availHeight;
    window.open(
        'patient_dashboard/index.html',
        'PatientDashboard',
        `width=${w},height=${h},left=0,top=0,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no`
    );
});

/* Exam / Presentation Mode — Open student dashboard in maximized window */
document.getElementById('openStudentMode').addEventListener('click', () => {
    const w = screen.availWidth;
    const h = screen.availHeight;
    window.open(
        'student_mode/index.html',
        'StudentMode',
        `width=${w},height=${h},left=0,top=0,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no`
    );
});

/* ESC Exit */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        eel.cancel_startup()();
        window.close();
    }
});

/* ============================================================
   Medical Patient Records — Chatbot JS
   Requires: eel.js loaded (Eel desktop framework)
   ============================================================ */

(function () {
  "use strict";

  /* ── DOM refs ── */
  const toggle    = document.getElementById("chatbot-toggle");
  const container = document.getElementById("chatbot-container");
  const closeBtn  = document.getElementById("close-chat");
  const sendBtn   = document.getElementById("send-btn");
  const inputEl   = document.getElementById("chat-input");
  const messagesEl= document.getElementById("chat-messages");
  const typingEl  = document.getElementById("typing-indicator");
  const badge     = document.getElementById("unread-badge");

  let isOpen    = false;
  let isBusy    = false;   // prevent double-sends
  let unreadCount = 0;

  /* ── Panel open / close ── */
  function openPanel() {
    isOpen = true;
    container.classList.add("visible");
    container.removeAttribute("hidden");
    inputEl.focus();
    clearBadge();
  }

  function closePanel() {
    isOpen = false;
    container.classList.remove("visible");
    // Let animation finish before hiding
    setTimeout(() => {
      if (!isOpen) container.style.display = "none";
    }, 280);
  }

  toggle.addEventListener("click", () => {
    if (isOpen) { closePanel(); }
    else         { container.style.display = "flex"; openPanel(); }
  });

  closeBtn.addEventListener("click", closePanel);

  /* ── Badge helpers ── */
  function incrementBadge() {
    if (isOpen) return;
    unreadCount++;
    badge.textContent = unreadCount > 9 ? "9+" : unreadCount;
    badge.hidden = false;
  }

  function clearBadge() {
    unreadCount = 0;
    badge.hidden = true;
  }

  /* ── Time helper ── */
  function nowTime() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  /* ── Add a message bubble ── */
  function addMessage(text, role /* "user" | "bot" */) {
    const row = document.createElement("div");
    row.className = `msg-row ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = text;

    const time = document.createElement("span");
    time.className = "msg-time";
    time.textContent = nowTime();

    row.appendChild(bubble);
    row.appendChild(time);

    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    if (role === "bot") incrementBadge();
  }

  /* ── Typing indicator ── */
  function showTyping() {
    typingEl.hidden = false;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    typingEl.hidden = true;
  }

  /* ── Lock / unlock input while waiting ── */
  function setLoading(state) {
    isBusy = state;
    sendBtn.disabled  = state;
    inputEl.disabled  = state;
  }

  /* ── Send message ── */
  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isBusy) return;

    addMessage(text, "user");
    inputEl.value = "";
    setLoading(true);
    showTyping();

    try {
      /* 
       * CRITICAL FIX:
       * Pass the raw user text string — NOT a parsed intent object.
       * The Python backend wraps it in {"chatInput": text} for n8n.
       */
      const reply = await eel.chatbot_query(text)();
      hideTyping();

      if (reply && typeof reply === "string" && reply.trim()) {
        addMessage(reply.trim(), "bot");
      } else {
        addMessage("⚠️ Received an empty response. Please try again.", "bot");
      }

    } catch (err) {
      hideTyping();
      console.error("eel.chatbot_query error:", err);
      addMessage(
        "🔌 Could not reach the AI service.\n" +
        "Make sure n8n is running on port 5678 and the workflow is active.",
        "bot"
      );
    } finally {
      setLoading(false);
      inputEl.focus();
    }
  }

  /* ── Event listeners ── */
  sendBtn.addEventListener("click", sendMessage);

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  /* ── Initial greeting (shown once on first open) ── */
  let greetingShown = false;

  function maybeShowGreeting() {
    if (greetingShown) return;
    greetingShown = true;
    addMessage(
      "Hello 👋 I am your Medical Records Assistant.\n\n" +
      "I can help you with:\n" +
      "1. Search patient records\n" +
      "2. Filter patients (age, gender, disease, etc.)\n" +
      "3. Update patient details\n" +
      "4. Delete patient records safely\n\n" +
      "Please tell me how I can assist you.",
      "bot"
    );
  }

  /* Hook greeting to first open */
  const _origOpen = openPanel;
  // Override so greeting fires before openPanel re-focuses
  toggle.addEventListener("click", maybeShowGreeting, { once: true });

})();
