/* ============================================================
   MedVision 3D — The Sterile Assistant
   ────────────────────────────────────
   Surgical-grade touchless interaction layer.
   Voice commands · Gesture slicing · Precision measurement
   
   This file is loaded AFTER script.js and hooks into the
   existing DOM/state without modifying the original code.
   ============================================================ */

(function () {
    'use strict';

    // ================================================================
    //  CONSTANTS
    // ================================================================
    const PIXEL_SCALE_DEFAULT = 0.143; // mm per pixel fallback
    const VOICE_COMMANDS = {
        'slicer': 'slicer', 'slice': 'slicer', 'slicing': 'slicer',
        'measure': 'measure', 'measurement': 'measure', 'ruler': 'measure',
        'navigate': 'navigate', 'navigation': 'navigate', 'move': 'navigate',
        'reset': 'reset', 'clear': 'reset',
        'zoom in': 'zoomIn', 'bigger': 'zoomIn', 'enhance': 'zoomIn',
        'zoom out': 'zoomOut', 'smaller': 'zoomOut',
        'next': 'next', 'next study': 'next',
        'previous': 'previous', 'prev': 'previous', 'back': 'previous',
        'invert': 'invert', 'negative': 'invert',
    };

    // ================================================================
    //  DOM REFERENCES (all new elements added by us)
    // ================================================================
    const sterileIndicator = document.getElementById('sterileIndicator');
    const modeBadge = document.getElementById('sterileModeBadge');
    const modeBadgeIcon = document.getElementById('sterileModeBadgeIcon');
    const modeBadgeText = document.getElementById('sterileModeBadgeText');
    const voiceToast = document.getElementById('voiceToast');
    const voiceToastText = document.getElementById('voiceToastText');
    const voiceWaveform = document.getElementById('voiceWaveform');
    const slicerOverlay = document.getElementById('slicerOverlay');
    const slicerLine = document.getElementById('slicerLine');
    const slicerDepthLabel = document.getElementById('slicerDepthLabel');
    const slicerDepthValue = document.getElementById('slicerDepthValue');
    const measureSvg = document.getElementById('measureSvg');
    const measureResult = document.getElementById('measureResult');
    const measureDistText = document.getElementById('measureDistText');
    const measureClearBtn = document.getElementById('measureClearBtn');

    // Existing DOM we hook into
    const mainImage = document.getElementById('mainImage');
    const imageFrame = document.querySelector('.image-frame');
    const viewport3d = document.getElementById('viewport3d');

    // Toolbar buttons
    const btnSlicer = document.getElementById('toolSlicer');
    const btnMeasure = document.getElementById('toolMeasure');
    const btnNavigate = document.getElementById('toolNavigate');
    const btnVoice = document.getElementById('toolVoice');

    // ================================================================
    //  MODE MANAGER
    // ================================================================
    const ModeManager = {
        current: 'navigate', // 'navigate' | 'slicer' | 'measure'

        modes: {
            navigate: { icon: '🧭', label: 'Navigation', color: '#00d4ff' },
            slicer: { icon: '🔪', label: 'Slicer', color: '#ff6b6b' },
            measure: { icon: '📏', label: 'Measurement', color: '#22d68a' },
        },

        set(mode) {
            if (!this.modes[mode] || this.current === mode) return;
            const prev = this.current;
            this.current = mode;

            // Deactivate previous
            this._deactivate(prev);
            // Activate new
            this._activate(mode);

            // Update UI
            SterileUI.updateModeBadge(mode);
            SterileUI.showToast(`Mode: ${this.modes[mode].label}`, this.modes[mode].icon);

            // Update toolbar active states
            [btnSlicer, btnMeasure, btnNavigate].forEach(btn => btn && btn.classList.remove('active'));
            if (mode === 'slicer' && btnSlicer) btnSlicer.classList.add('active');
            if (mode === 'measure' && btnMeasure) btnMeasure.classList.add('active');
            if (mode === 'navigate' && btnNavigate) btnNavigate.classList.add('active');

            console.log(`%c[Sterile] Mode: ${mode}`, `color: ${this.modes[mode].color}`);
        },

        _activate(mode) {
            if (mode === 'slicer') SlicerEngine.enable();
            if (mode === 'measure') MeasurementEngine.enable();
            if (mode === 'navigate') {
                // Navigate uses existing script.js tools — nothing extra needed
            }
        },

        _deactivate(mode) {
            if (mode === 'slicer') SlicerEngine.disable();
            if (mode === 'measure') MeasurementEngine.disable();
        },

        cycle() {
            const order = ['navigate', 'slicer', 'measure'];
            const idx = order.indexOf(this.current);
            this.set(order[(idx + 1) % order.length]);
        }
    };

    // ================================================================
    //  SLICER ENGINE
    //  Uses CSS clip-path: inset() to create a "slicing" clipping plane
    // ================================================================
    const SlicerEngine = {
        enabled: false,
        position: 50,       // 0–100 (percentage from top)
        sliceWidth: 8,      // Width of visible band in percentage
        isDragging: false,

        enable() {
            this.enabled = true;
            this.position = 50;
            slicerOverlay.classList.add('visible');
            this._updateClip();
            this._updateVisuals();
        },

        disable() {
            this.enabled = false;
            slicerOverlay.classList.remove('visible');
            // Remove clip-path from image
            mainImage.style.clipPath = '';
        },

        setPosition(pct) {
            this.position = Math.max(0, Math.min(100, pct));
            this._updateClip();
            this._updateVisuals();
        },

        _updateClip() {
            // Create a band that reveals a portion of the image
            // Top inset and bottom inset leave only a horizontal stripe visible
            const halfBand = this.sliceWidth / 2;
            const top = Math.max(0, this.position - halfBand);
            const bottom = Math.max(0, 100 - this.position - halfBand);
            mainImage.style.clipPath = `inset(${top}% 0 ${bottom}% 0)`;
        },

        _updateVisuals() {
            // Position the scan line element
            if (slicerLine) {
                slicerLine.style.top = `${this.position}%`;
            }
            if (slicerDepthValue) {
                slicerDepthValue.textContent = `${Math.round(this.position)}%`;
            }
        },

        handleScroll(deltaY) {
            if (!this.enabled) return;
            const step = deltaY > 0 ? 1.5 : -1.5;
            this.setPosition(this.position + step);
        },

        handleDrag(clientY) {
            if (!this.enabled) return;
            const rect = imageFrame.getBoundingClientRect();
            const relY = clientY - rect.top;
            const pct = (relY / rect.height) * 100;
            this.setPosition(pct);
        }
    };

    // ================================================================
    //  MEASUREMENT ENGINE
    //  Click two points → draw SVG ruler → calculate distance
    // ================================================================
    const MeasurementEngine = {
        enabled: false,
        points: [],          // [{x, y, svgEl}] — max 2 points
        lineEl: null,        // SVG line element
        labelEl: null,       // SVG text label
        pixelScale: PIXEL_SCALE_DEFAULT,

        enable() {
            this.enabled = true;
            measureSvg.classList.add('visible');
            this._updateScale();
        },

        disable() {
            this.enabled = false;
            measureSvg.classList.remove('visible');
            measureResult.classList.remove('visible');
        },

        clear() {
            // Remove SVG children
            while (measureSvg.firstChild) {
                measureSvg.removeChild(measureSvg.firstChild);
            }
            this.points = [];
            this.lineEl = null;
            this.labelEl = null;
            measureResult.classList.remove('visible');
        },

        _updateScale() {
            // Try to get pixel size from DICOM metadata display
            const metaPixelEl = document.getElementById('metaPixel');
            if (metaPixelEl) {
                const val = parseFloat(metaPixelEl.textContent);
                if (!isNaN(val) && val > 0) {
                    this.pixelScale = val;
                }
            }
        },

        addPoint(clientX, clientY) {
            if (!this.enabled) return;
            if (this.points.length >= 2) {
                this.clear();
            }

            // Get position relative to the SVG overlay
            const rect = measureSvg.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;

            // Create point marker
            const marker = this._createMarker(x, y);
            measureSvg.appendChild(marker);

            this.points.push({ x, y, svgEl: marker });

            if (this.points.length === 2) {
                this._drawLine();
                this._calcDistance();
            }
        },

        _createMarker(x, y) {
            const ns = 'http://www.w3.org/2000/svg';

            const g = document.createElementNS(ns, 'g');
            g.setAttribute('class', 'measure-point');

            // Outer ring (animated pulse)
            const outerRing = document.createElementNS(ns, 'circle');
            outerRing.setAttribute('cx', x);
            outerRing.setAttribute('cy', y);
            outerRing.setAttribute('r', '12');
            outerRing.setAttribute('class', 'measure-ring');

            // Inner dot
            const dot = document.createElementNS(ns, 'circle');
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
            dot.setAttribute('r', '4');
            dot.setAttribute('class', 'measure-dot');

            // Crosshair lines
            const lineH = document.createElementNS(ns, 'line');
            lineH.setAttribute('x1', x - 18);
            lineH.setAttribute('y1', y);
            lineH.setAttribute('x2', x + 18);
            lineH.setAttribute('y2', y);
            lineH.setAttribute('class', 'measure-cross');

            const lineV = document.createElementNS(ns, 'line');
            lineV.setAttribute('x1', x);
            lineV.setAttribute('y1', y - 18);
            lineV.setAttribute('x2', x);
            lineV.setAttribute('y2', y + 18);
            lineV.setAttribute('class', 'measure-cross');

            // Point label (A or B)
            const label = document.createElementNS(ns, 'text');
            label.setAttribute('x', x + 16);
            label.setAttribute('y', y - 14);
            label.setAttribute('class', 'measure-label');
            label.textContent = this.points.length === 0 ? 'A' : 'B';

            g.appendChild(outerRing);
            g.appendChild(lineH);
            g.appendChild(lineV);
            g.appendChild(dot);
            g.appendChild(label);

            return g;
        },

        _drawLine() {
            const ns = 'http://www.w3.org/2000/svg';
            const p1 = this.points[0];
            const p2 = this.points[1];

            // Dashed ruler line
            const line = document.createElementNS(ns, 'line');
            line.setAttribute('x1', p1.x);
            line.setAttribute('y1', p1.y);
            line.setAttribute('x2', p2.x);
            line.setAttribute('y2', p2.y);
            line.setAttribute('class', 'measure-line');
            measureSvg.appendChild(line);
            this.lineEl = line;

            // Tick marks along the line
            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const perpAngle = angle + Math.PI / 2;
            const tickLen = 6;
            const tickSpacing = 20;
            const numTicks = Math.floor(dist / tickSpacing);

            for (let i = 0; i <= numTicks; i++) {
                const t = i / numTicks;
                const tx = p1.x + (p2.x - p1.x) * t;
                const ty = p1.y + (p2.y - p1.y) * t;
                const tick = document.createElementNS(ns, 'line');
                tick.setAttribute('x1', tx - Math.cos(perpAngle) * tickLen);
                tick.setAttribute('y1', ty - Math.sin(perpAngle) * tickLen);
                tick.setAttribute('x2', tx + Math.cos(perpAngle) * tickLen);
                tick.setAttribute('y2', ty + Math.sin(perpAngle) * tickLen);
                tick.setAttribute('class', 'measure-tick');
                measureSvg.appendChild(tick);
            }

            // Mid-point label background
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const labelBg = document.createElementNS(ns, 'rect');
            labelBg.setAttribute('x', midX - 40);
            labelBg.setAttribute('y', midY - 28);
            labelBg.setAttribute('width', 80);
            labelBg.setAttribute('height', 22);
            labelBg.setAttribute('rx', 6);
            labelBg.setAttribute('class', 'measure-label-bg');
            measureSvg.appendChild(labelBg);

            // Distance text on the line
            const text = document.createElementNS(ns, 'text');
            text.setAttribute('x', midX);
            text.setAttribute('y', midY - 14);
            text.setAttribute('class', 'measure-dist-inline');
            text.setAttribute('text-anchor', 'middle');
            measureSvg.appendChild(text);
            this.labelEl = text;
        },

        _calcDistance() {
            const p1 = this.points[0];
            const p2 = this.points[1];
            const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const mmDist = pixelDist * this.pixelScale;
            const cmDist = mmDist / 10;

            let displayText;
            if (cmDist >= 1) {
                displayText = `${cmDist.toFixed(1)} cm`;
            } else {
                displayText = `${mmDist.toFixed(1)} mm`;
            }

            // Update inline SVG label
            if (this.labelEl) {
                this.labelEl.textContent = displayText;
            }

            // Show result popup
            measureDistText.textContent = `Distance: ${displayText}`;
            measureResult.classList.add('visible');

            SterileUI.showToast(`Measured: ${displayText}`, '📏');
        }
    };

    // ================================================================
    //  VOICE COMMAND ENGINE
    //  Browser-native Web Speech API (SpeechRecognition)
    // ================================================================
    const VoiceEngine = {
        recognition: null,
        isListening: false,
        isSupported: false,

        init() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                console.warn('[Sterile] Speech Recognition not supported in this browser');
                this.isSupported = false;
                if (btnVoice) btnVoice.setAttribute('title', 'Voice not supported in this browser');
                return;
            }

            this.isSupported = true;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';
            this.recognition.maxAlternatives = 3;

            this.recognition.onresult = (event) => {
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        const transcript = event.results[i][0].transcript.trim().toLowerCase();
                        this._processCommand(transcript);
                    }
                }
            };

            this.recognition.onerror = (event) => {
                if (event.error === 'no-speech') return; // Ignore silence
                console.warn('[Sterile] Voice error:', event.error);
                if (event.error === 'not-allowed') {
                    SterileUI.showToast('Microphone access denied', '🚫');
                    this.stop();
                }
            };

            this.recognition.onend = () => {
                // Auto-restart if still supposed to be listening
                if (this.isListening) {
                    try {
                        this.recognition.start();
                    } catch (e) {
                        // Already started
                    }
                }
            };
        },

        toggle() {
            if (!this.isSupported) {
                SterileUI.showToast('Voice not supported in this browser', '🚫');
                return;
            }
            if (this.isListening) {
                this.stop();
            } else {
                this.start();
            }
        },

        start() {
            if (!this.isSupported || this.isListening) return;
            try {
                this.recognition.start();
                this.isListening = true;
                btnVoice && btnVoice.classList.add('active', 'voice-listening');
                voiceWaveform && voiceWaveform.classList.add('active');
                SterileUI.showToast('Voice commands active', '🎤');
                console.log('%c[Sterile] Voice listening...', 'color: #22d68a');
            } catch (e) {
                console.error('[Sterile] Failed to start voice:', e);
            }
        },

        stop() {
            if (!this.recognition) return;
            this.isListening = false;
            try {
                this.recognition.stop();
            } catch (e) { /* ignore */ }
            btnVoice && btnVoice.classList.remove('active', 'voice-listening');
            voiceWaveform && voiceWaveform.classList.remove('active');
            SterileUI.showToast('Voice commands paused', '🔇');
        },

        _processCommand(transcript) {
            console.log(`%c[Sterile] Heard: "${transcript}"`, 'color: #ffb547');

            // Check against command map
            let matched = false;
            for (const [phrase, action] of Object.entries(VOICE_COMMANDS)) {
                if (transcript.includes(phrase)) {
                    this._executeAction(action, phrase);
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                SterileUI.showToast(`"${transcript}" — not recognized`, '❓');
            }
        },

        _executeAction(action, phrase) {
            SterileUI.showToast(`"${phrase}"`, '🎤');

            switch (action) {
                case 'slicer':
                    ModeManager.set('slicer');
                    break;
                case 'measure':
                    ModeManager.set('measure');
                    break;
                case 'navigate':
                    ModeManager.set('navigate');
                    break;
                case 'reset':
                    // Trigger existing reset button
                    document.getElementById('toolReset')?.click();
                    MeasurementEngine.clear();
                    SlicerEngine.disable();
                    ModeManager.set('navigate');
                    break;
                case 'zoomIn':
                    // Simulate keyboard +
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
                    break;
                case 'zoomOut':
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: '-' }));
                    break;
                case 'next':
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
                    break;
                case 'previous':
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
                    break;
                case 'invert':
                    document.getElementById('toolInvert')?.click();
                    break;
            }
        }
    };

    // ================================================================
    //  STERILE UI MANAGER
    //  Visual feedback: toasts, mode badge, sterile indicator
    // ================================================================
    const SterileUI = {
        toastTimeout: null,

        init() {
            // Set initial mode badge
            this.updateModeBadge('navigate');
        },

        updateModeBadge(mode) {
            const info = ModeManager.modes[mode];
            if (!info) return;
            if (modeBadgeIcon) modeBadgeIcon.textContent = info.icon;
            if (modeBadgeText) modeBadgeText.textContent = info.label;
            if (modeBadge) modeBadge.style.setProperty('--mode-color', info.color);
        },

        showToast(message, icon = '🔔') {
            if (!voiceToast || !voiceToastText) return;

            voiceToastText.innerHTML = `<span class="toast-icon">${icon}</span> ${message}`;
            voiceToast.classList.remove('visible');

            // Force reflow for re-animation
            void voiceToast.offsetWidth;
            voiceToast.classList.add('visible');

            clearTimeout(this.toastTimeout);
            this.toastTimeout = setTimeout(() => {
                voiceToast.classList.remove('visible');
            }, 2500);
        }
    };

    // ================================================================
    //  EVENT WIRING
    // ================================================================

    // --- Toolbar buttons ---
    btnSlicer?.addEventListener('click', () => ModeManager.set('slicer'));
    btnMeasure?.addEventListener('click', () => ModeManager.set('measure'));
    btnNavigate?.addEventListener('click', () => ModeManager.set('navigate'));
    btnVoice?.addEventListener('click', () => VoiceEngine.toggle());

    // --- Measurement: click on viewport to place points ---
    viewport3d?.addEventListener('click', (e) => {
        if (ModeManager.current !== 'measure') return;

        // Don't trigger on toolbar or sidebar clicks
        if (e.target.closest('.bottom-toolbar') || e.target.closest('.sidebar')
            || e.target.closest('.right-panel') || e.target.closest('.top-bar')) return;

        MeasurementEngine.addPoint(e.clientX, e.clientY);
    });

    // --- Measurement: clear button ---
    measureClearBtn?.addEventListener('click', () => {
        MeasurementEngine.clear();
    });

    // --- Slicer: scroll to move slice ---
    viewport3d?.addEventListener('wheel', (e) => {
        if (ModeManager.current === 'slicer') {
            e.preventDefault();
            e.stopPropagation();
            SlicerEngine.handleScroll(e.deltaY);
        }
    }, { passive: false, capture: true });

    // --- Slicer: drag to move slice ---
    viewport3d?.addEventListener('mousemove', (e) => {
        if (ModeManager.current === 'slicer' && e.buttons === 1) {
            e.stopPropagation();
            SlicerEngine.handleDrag(e.clientY);
        }
    }, { capture: true });

    // Stop drag initiation in slicer mode from triggering pan
    viewport3d?.addEventListener('mousedown', (e) => {
        if (ModeManager.current === 'slicer') {
            e.stopPropagation();
        }
    }, { capture: true });

    // Handle tool reset button click explicitly
    document.getElementById('toolReset')?.addEventListener('click', () => {
        MeasurementEngine.clear();
        SlicerEngine.disable();
        ModeManager.set('navigate');
    });

    // --- Keyboard shortcuts for sterile modes ---
    document.addEventListener('keydown', (e) => {
        // Don't interfere with input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key.toLowerCase()) {
            case 's':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    ModeManager.set('slicer');
                }
                break;
            case 'm':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    ModeManager.set('measure');
                }
                break;
            case 'n':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    ModeManager.set('navigate');
                }
                break;
            case 'v':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    VoiceEngine.toggle();
                }
                break;
            case 'c':
                if (!e.ctrlKey && !e.metaKey && ModeManager.current === 'measure') {
                    e.preventDefault();
                    MeasurementEngine.clear();
                }
                break;
            case 'tab':
                e.preventDefault();
                ModeManager.cycle();
                break;
        }
    });

    // --- Clean up measurements when study is switched ---
    const observer = new MutationObserver(() => {
        if (ModeManager.current === 'measure') {
            MeasurementEngine.clear();
        }
        if (ModeManager.current === 'slicer') {
            SlicerEngine.setPosition(50);
        }
        MeasurementEngine._updateScale();
    });

    if (mainImage) {
        observer.observe(mainImage, { attributes: true, attributeFilter: ['src'] });
    }

    // ================================================================
    //  INITIALIZATION
    // ================================================================
    VoiceEngine.init();
    SterileUI.init();
    ModeManager.set('navigate');

    console.log('%c ⚕ The Sterile Assistant — Initialized', 'color: #22d68a; font-weight: bold; font-size: 14px;');
    console.log('%c Voice Commands · Gesture Slicing · Precision Measurement', 'color: #7b61ff; font-size: 11px;');

})();
