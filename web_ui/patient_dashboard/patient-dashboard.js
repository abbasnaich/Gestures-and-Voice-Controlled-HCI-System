/**
 * Smart Bedside Controller — aligned with medical_viewer (tokens, voice pattern).
 * Emergency: continuous alarm + red wave until Cancel button or voice "cancel".
 */
(function () {
    'use strict';

    const DWELL_MS = 900;
    const WAVE_WINDOW_MS = 700;
    const WAVE_MIN_REVERSALS = 3;
    const WAVE_MIN_DELTA = 6;

    const ACTIONS = {
        water: { label: 'Water', toast: 'Water request sent — care team notified.' },
        nurse: { label: 'Nurse', toast: 'Nurse call sent — someone will check on you.' },
        light: { label: 'Light', toast: 'Light adjustment requested.' },
        fan: { label: 'Fan', toast: 'Fan / airflow request sent.' },
    };

    function isEmergencyStart(text) {
        return /\b(emergency|help|sos)\b/i.test(text);
    }

    function isCancelUtterance(text) {
        const t = text.trim();
        if (/^(cancel|stop)$/i.test(t)) return true;
        if (/\b(never mind|call off)\b/i.test(t)) return true;
        if (/\b(cancel|stop|end)\s+(the\s+)?(alert|emergency|alarm)\b/i.test(t)) return true;
        if (/\bturn\s+(it\s+)?off\b/i.test(t)) return true;
        return false;
    }

    const VOICE_ACTIONS = [
        { keys: ['water', 'drink', 'thirst', 'thirsty'], action: 'water' },
        { keys: ['nurse', 'pain', 'medication', 'medicine'], action: 'nurse' },
        { keys: ['light', 'lamp', 'bright', 'dim'], action: 'light' },
        { keys: ['fan', 'air', 'cool', 'breeze'], action: 'fan' },
    ];

    const rail = document.getElementById('iconRail');
    const buttons = () => Array.from(rail.querySelectorAll('.rail-btn[data-action]'));
    const gestureStatusLabel = document.getElementById('gestureStatusLabel');
    const messagePrimary = document.getElementById('messagePrimary');
    const messageSecondary = document.getElementById('messageSecondary');
    const clockDisplay = document.getElementById('clockDisplay');
    const toastEl = document.getElementById('toast');
    const emergencyLayer = document.getElementById('emergencyLayer');
    const emergencyCancelBtn = document.getElementById('emergencyCancelBtn');
    const activeRequestCard = document.getElementById('activeRequestCard');
    const activeLabel = activeRequestCard.querySelector('.active-label');
    const activeTimeEl = document.getElementById('activeRequestTime');
    const requestLog = document.getElementById('requestLog');
    const voiceToggle = document.getElementById('voiceToggle');
    const voiceToggleLabel = document.getElementById('voiceToggleLabel');

    let dwellTimer = null;
    let dwellTarget = null;
    let waveFocusIndex = -1;
    let lastWaveX = 0;
    let lastWaveDir = 0;
    let reversalCount = 0;
    let waveWindowStart = 0;
    let requestLock = false;

    let emergencyActive = false;
    let alarmTimer = null;
    let audioCtx = null;
    let lastNormalSummary = 'None';
    let lastRequestAt = '—';
    let requestCount = 0;

    const requestCountEl = document.getElementById('requestCount');
    const nextCheckinEl = document.getElementById('nextCheckin');
    const resetRequestsBtn = document.getElementById('resetRequestsBtn');

    function setRequestActiveBtn(btn) {
        buttons().forEach((b) => b.classList.remove('request-active'));
        if (btn) btn.classList.add('request-active');
    }

    function formatNow() {
        return new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }

    function formatFullTime() {
        return new Date().toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    }

    function tickClock() {
        clockDisplay.textContent = new Date().toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function showToast(text, duration = 2800) {
        toastEl.textContent = text;
        toastEl.hidden = false;
        toastEl.classList.add('visible');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => {
            toastEl.classList.remove('visible');
            toastEl.hidden = true;
        }, duration);
    }

    function setGestureStatus(text) {
        gestureStatusLabel.textContent = text;
    }

    function appendLog(message, type = 'info') {
        const li = document.createElement('li');
        li.className = 'log-entry' + (type === 'critical' ? ' log-entry--critical' : type === 'cleared' ? ' log-entry--cleared' : '');
        li.innerHTML = `<span class="log-time">${formatFullTime()}</span><span class="log-text">${message}</span>`;
        requestLog.prepend(li);
        while (requestLog.children.length > 14) {
            requestLog.removeChild(requestLog.lastChild);
        }
    }

    function setActiveRequest(label, timeStr, isEmergency) {
        activeLabel.textContent = label;
        activeTimeEl.textContent = timeStr;
        activeRequestCard.classList.toggle('emergency-on', !!isEmergency);
    }

    function updateWaveFocusVisual() {
        const btns = buttons();
        btns.forEach((b, i) => b.classList.toggle('wave-focus', waveFocusIndex >= 0 && i === waveFocusIndex));
    }

    function cycleWaveFocus() {
        const btns = buttons();
        if (!btns.length) return;
        waveFocusIndex = (waveFocusIndex + 1) % btns.length;
        updateWaveFocusVisual();
        setGestureStatus('Wave: highlight moved — hold to send request');
    }

    function clearDwell() {
        if (dwellTimer) {
            clearTimeout(dwellTimer);
            dwellTimer = null;
        }
        if (dwellTarget) {
            dwellTarget.classList.remove('dwell-active');
            dwellTarget = null;
        }
    }

    function startDwell(btn) {
        clearDwell();
        setRequestActiveBtn(btn);
        dwellTarget = btn;
        dwellTarget.classList.add('dwell-active');
        dwellTimer = setTimeout(() => {
            const action = dwellTarget && dwellTarget.getAttribute('data-action');
            if (dwellTarget) dwellTarget.classList.remove('dwell-active');
            dwellTimer = null;
            dwellTarget = null;
            if (action) fulfillRequest(action, 'dwell');
        }, DWELL_MS);
    }

    function onRailPointerMove(e) {
        const x = e.clientX;
        const dx = x - lastWaveX;
        if (Math.abs(dx) < WAVE_MIN_DELTA) return;
        const dir = dx > 0 ? 1 : -1;
        if (lastWaveDir !== 0 && dir !== lastWaveDir) {
            if (reversalCount === 0) waveWindowStart = performance.now();
            reversalCount++;
            const elapsed = performance.now() - waveWindowStart;
            if (elapsed > WAVE_WINDOW_MS) {
                reversalCount = 1;
                waveWindowStart = performance.now();
            } else if (reversalCount >= WAVE_MIN_REVERSALS) {
                cycleWaveFocus();
                reversalCount = 0;
            }
        }
        lastWaveDir = dir;
        lastWaveX = x;
    }

    function fulfillRequest(action, source) {
        if (emergencyActive) return;
        const info = ACTIONS[action];
        if (!info || requestLock) return;
        requestLock = true;
        setTimeout(() => {
            requestLock = false;
        }, 450);

        lastNormalSummary = info.label;
        lastRequestAt = formatFullTime();
        requestCount += 1;
        if (requestCountEl) requestCountEl.textContent = String(requestCount);
        messagePrimary.textContent = `Last request: ${info.label}`;
        messageSecondary.textContent =
            source === 'voice'
                ? 'Voice command received. Speak again anytime the mic is on.'
                : 'Request logged for your care team.';

        setActiveRequest(lastNormalSummary, lastRequestAt, false);

        const btn = rail.querySelector(`.rail-btn[data-action="${action}"]`);
        if (btn) {
            setRequestActiveBtn(btn);
            btn.classList.add('sent-ok');
            setTimeout(() => btn.classList.remove('sent-ok'), 600);
        }

        setGestureStatus(source === 'voice' ? 'Voice request logged' : 'Gesture request logged');
        appendLog(`${info.label} requested (${source})`, 'info');
        showToast(info.toast);
    }

    function ensureAudioCtx() {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        if (!audioCtx) audioCtx = new AC();
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        return audioCtx;
    }

    function playOneBeep(ctx) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = 880;
        o.connect(g);
        g.connect(ctx.destination);
        const t = ctx.currentTime;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.13, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.start(t);
        o.stop(t + 0.24);
    }

    function startEmergencyAlarm() {
        stopEmergencyAlarm();
        const ctx = ensureAudioCtx();
        if (!ctx) return;
        playOneBeep(ctx);
        alarmTimer = window.setInterval(() => {
            if (!emergencyActive) return;
            const c = ensureAudioCtx();
            if (c) playOneBeep(c);
        }, 780);
    }

    function stopEmergencyAlarm() {
        if (alarmTimer) {
            clearInterval(alarmTimer);
            alarmTimer = null;
        }
    }

    function beginEmergency(source) {
        if (emergencyActive) return;
        emergencyActive = true;
        emergencyLayer.hidden = false;
        emergencyLayer.setAttribute('aria-hidden', 'false');
        document.body.classList.add('emergency-ui-blur');

        const line = `Emergency alert is active — your care team is being notified. (${source === 'voice' ? 'Voice' : 'Gesture'})`;
        messagePrimary.textContent = 'Emergency alert — active';
        messageSecondary.textContent = 'Sound and alert continue until you cancel or say “cancel”.';
        setGestureStatus('Emergency — acknowledge or cancel');

        setActiveRequest('Emergency — active', formatFullTime(), true);
        appendLog(`Emergency started (${source})`, 'critical');

        startEmergencyAlarm();
        showToast('Emergency alert — use Cancel or say “cancel” to stop.', 5000);

        setTimeout(() => emergencyCancelBtn.focus({ preventScroll: true }), 80);
    }

    function endEmergency(how) {
        if (!emergencyActive) return;
        emergencyActive = false;
        stopEmergencyAlarm();
        if (audioCtx) {
            audioCtx.suspend().catch(() => {});
        }
        emergencyLayer.hidden = true;
        emergencyLayer.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('emergency-ui-blur');

        messagePrimary.textContent = 'Emergency alert ended';
        messageSecondary.textContent = 'You can send comfort requests from the menu anytime.';
        setGestureStatus(how === 'voice' ? 'Emergency cancelled by voice' : 'Emergency cancelled');

        appendLog(`Emergency cancelled (${how})`, 'cleared');
        setActiveRequest(lastNormalSummary, lastRequestAt, false);
        setRequestActiveBtn(null);

        showToast('Emergency alert stopped.', 3200);
    }

    /* ---- Ambient particles (compact, matches medical_viewer mood) ---- */
    function initAmbient() {
        const canvas = document.getElementById('ambientCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const particles = [];

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        const n = 45;
        for (let i = 0; i < n; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 1.2 + 0.3,
                dx: (Math.random() - 0.5) * 0.2,
                dy: (Math.random() - 0.5) * 0.2,
                opacity: Math.random() * 0.25 + 0.08,
                color: Math.random() > 0.65 ? '123, 97, 255' : '0, 212, 255',
            });
        }

        function frame() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach((p) => {
                p.x += p.dx;
                p.y += p.dy;
                if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
                if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${p.color}, ${p.opacity})`;
                ctx.fill();
            });
            requestAnimationFrame(frame);
        }
        frame();
    }

    /* ---- Voice ---- */
    const Voice = {
        recognition: null,
        listening: false,

        init() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                voiceToggle.disabled = true;
                voiceToggleLabel.textContent = 'Unavailable';
                return;
            }
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        const text = event.results[i][0].transcript.trim().toLowerCase();
                        this.handleTranscript(text);
                    }
                }
            };

            this.recognition.onerror = (event) => {
                if (event.error === 'no-speech') return;
                if (event.error === 'not-allowed') {
                    showToast('Microphone denied — check browser settings.');
                    this.stop();
                }
            };

            this.recognition.onend = () => {
                if (this.listening) {
                    try {
                        this.recognition.start();
                    } catch (_) { /* */ }
                }
            };
        },

        handleTranscript(text) {
            if (emergencyActive) {
                if (isCancelUtterance(text)) {
                    endEmergency('voice');
                }
                return;
            }

            if (isCancelUtterance(text)) {
                return;
            }

            if (isEmergencyStart(text)) {
                beginEmergency('voice');
                return;
            }

            for (const { keys, action } of VOICE_ACTIONS) {
                for (const k of keys) {
                    if (text.includes(k)) {
                        fulfillRequest(action, 'voice');
                        return;
                    }
                }
            }

            showToast(`Heard: “${text}” — try Water, Nurse, Light, Fan, or Emergency.`, 2600);
        },

        toggle() {
            if (!this.recognition) return;
            if (this.listening) this.stop();
            else this.start();
        },

        start() {
            if (!this.recognition || this.listening) return;
            try {
                this.recognition.start();
                this.listening = true;
                voiceToggle.setAttribute('aria-pressed', 'true');
                voiceToggle.classList.add('active', 'voice-listening');
                voiceToggleLabel.textContent = 'Voice on';
                setGestureStatus('Listening…');
            } catch (e) {
                console.warn(e);
            }
        },

        stop() {
            if (!this.recognition) return;
            this.listening = false;
            try {
                this.recognition.stop();
            } catch (_) { /* */ }
            voiceToggle.setAttribute('aria-pressed', 'false');
            voiceToggle.classList.remove('active', 'voice-listening');
            voiceToggleLabel.textContent = 'Voice off';
            setGestureStatus('Gesture tracking ready');
        },
    };

    /* ---- Rail ---- */
    rail.addEventListener('pointerenter', (e) => {
        lastWaveX = e.clientX;
        lastWaveDir = 0;
        reversalCount = 0;
    });
    rail.addEventListener('pointermove', onRailPointerMove, { passive: true });

    buttons().forEach((btn) => {
        btn.addEventListener('pointerenter', () => {
            if (emergencyActive) return;
            setRequestActiveBtn(btn);
            startDwell(btn);
        });
        btn.addEventListener('pointerleave', (e) => {
            const to = e.relatedTarget;
            if (to && btn.contains(to)) return;
            clearDwell();
        });
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            clearDwell();
            const action = btn.getAttribute('data-action');
            if (action && !emergencyActive) fulfillRequest(action, 'click');
        });
    });

    emergencyCancelBtn.addEventListener('click', () => endEmergency('button'));

    voiceToggle.addEventListener('click', () => Voice.toggle());

    Voice.init();
    initAmbient();
    tickClock();
    setInterval(tickClock, 30000);
    updateWaveFocusVisual();
    setActiveRequest('None', lastRequestAt, false);
    setRequestActiveBtn(null);

    if (nextCheckinEl) {
        const d = new Date();
        d.setMinutes(d.getMinutes() + 45);
        nextCheckinEl.textContent = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }

    resetRequestsBtn?.addEventListener('click', () => {
        if (emergencyActive) return;
        requestLog.innerHTML = '';
        requestCount = 0;
        if (requestCountEl) requestCountEl.textContent = '0';
        lastNormalSummary = 'None';
        lastRequestAt = '—';
        setActiveRequest('None', lastRequestAt, false);
        setRequestActiveBtn(null);
        showToast('Request history cleared.', 2200);
        setGestureStatus('Gesture tracking ready');
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'Escape' && emergencyActive) {
            e.preventDefault();
            endEmergency('keyboard');
        }
        if (e.key.toLowerCase() === 'v' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            Voice.toggle();
        }
    });

    console.log('%cBedside Care — ready (MedVision-aligned)', 'color:#00d4ff;font-weight:bold');
})();
