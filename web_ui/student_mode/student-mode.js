/**
 * Student Mode — Exam / Presentation Mode for Students with Disabilities
 * - Gesture: dwell (point & hold) selection; wave cycles focus inside containers
 * - Voice: browser SpeechRecognition (same approach as medical_viewer)
 * - Presentation: PPTX parsed client-side with JSZip (no external renderer needed)
 */
(function () {
    'use strict';

    const DWELL_MS = 900;
    const WAVE_WINDOW_MS = 700;
    const WAVE_MIN_REVERSALS = 3;
    const WAVE_MIN_DELTA = 7;

    const statusText = document.getElementById('statusText');
    const clockDisplay = document.getElementById('clockDisplay');
    const toastEl = document.getElementById('toast');
    const activityLog = document.getElementById('activityLog');
    const resetLogBtn = document.getElementById('resetLogBtn');
    const focusLabel = document.getElementById('focusLabel');
    const focusMeta = document.getElementById('focusMeta');

    const views = {
        home: document.getElementById('homeView'),
        exam: document.getElementById('examView'),
        present: document.getElementById('presentView'),
    };

    const modeButtons = Array.from(document.querySelectorAll('.mode-item[data-mode]'));
    const goExamCard = document.getElementById('goExamCard');
    const goPresentCard = document.getElementById('goPresentCard');

    // Exam DOM
    const topicGrid = document.getElementById('topicGrid');
    const examStageTopics = document.getElementById('examStageTopics');
    const examStageQuestion = document.getElementById('examStageQuestion');
    const examStageResult = document.getElementById('examStageResult');
    const examTopicTag = document.getElementById('examTopicTag');
    const questionProgress = document.getElementById('questionProgress');
    const questionText = document.getElementById('questionText');
    const optionsGrid = document.getElementById('optionsGrid');
    const prevQBtn = document.getElementById('prevQBtn');
    const nextQBtn = document.getElementById('nextQBtn');
    const submitExamBtn = document.getElementById('submitExamBtn');
    const scoreText = document.getElementById('scoreText');
    const scoreLine = document.getElementById('scoreLine');
    const backToTopicsBtn = document.getElementById('backToTopicsBtn');
    const examResetBtn = document.getElementById('examResetBtn');

    // Presentation DOM
    const pptInput = document.getElementById('pptInput');
    const pptStatus = document.getElementById('pptStatus');
    const pptPrevBtn = document.getElementById('pptPrevBtn');
    const pptNextBtn = document.getElementById('pptNextBtn');
    const pptCloseBtn = document.getElementById('closePresentationBtn');
    const pptCount = document.getElementById('pptCount');
    const pptCanvas = document.getElementById('pptCanvas');

    // Voice DOM
    const voiceToggle = document.getElementById('voiceToggle');
    const voiceToggleLabel = document.getElementById('voiceToggleLabel');

    // --------------------------
    // Exam data (Grade 5)
    // --------------------------
    const TOPICS = [
        {
            id: 'math',
            title: 'Math Basics',
            blurb: 'Addition, subtraction, multiplication, and simple fractions.',
            questions: [
                q('What is 8 + 7?', ['13', '14', '15', '16'], 2),
                q('What is 12 − 5?', ['5', '6', '7', '8'], 2),
                q('What is 6 × 4?', ['18', '20', '24', '28'], 2),
                q('Which is bigger?', ['1/2', '1/3', '1/4', '1/5'], 0),
                q('What is 30 ÷ 5?', ['4', '5', '6', '7'], 2),
            ],
        },
        {
            id: 'science',
            title: 'Science (Plants)',
            blurb: 'Parts of plants and what they do.',
            questions: [
                q('Which part of a plant makes food?', ['Roots', 'Leaves', 'Stem', 'Flower'], 1),
                q('Roots mainly help the plant to…', ['Make seeds', 'Take in water', 'Catch sunlight', 'Make petals'], 1),
                q('Which part carries water to leaves?', ['Stem', 'Flower', 'Fruit', 'Seed'], 0),
                q('A flower often helps the plant to…', ['Move', 'Reproduce', 'Drink', 'Grow taller'], 1),
                q('Plants need sunlight to…', ['Sleep', 'Photosynthesize', 'Swim', 'Speak'], 1),
            ],
        },
        {
            id: 'english',
            title: 'English (Grammar)',
            blurb: 'Nouns, verbs, and simple sentences.',
            questions: [
                q('Which word is a noun?', ['Run', 'Happy', 'Dog', 'Quickly'], 2),
                q('Which word is a verb?', ['Chair', 'Jump', 'Blue', 'Slow'], 1),
                q('Choose the correct sentence.', ['She go to school.', 'She goes to school.', 'She going school.', 'She gone school.'], 1),
                q('Which is a plural noun?', ['Cat', 'Cats', 'Catted', 'Catty'], 1),
                q('Pick the adjective.', ['Beautiful', 'Eat', 'Table', 'Write'], 0),
            ],
        },
        {
            id: 'history',
            title: 'History (Community)',
            blurb: 'Helpers and places in a community.',
            questions: [
                q('Who helps put out fires?', ['Doctor', 'Firefighter', 'Chef', 'Teacher'], 1),
                q('Where do you borrow books?', ['Library', 'Bakery', 'Garage', 'Farm'], 0),
                q('A doctor works in a…', ['Hospital', 'Airport', 'Factory', 'Zoo'], 0),
                q('Who teaches students?', ['Pilot', 'Teacher', 'Farmer', 'Driver'], 1),
                q('Where do you mail a letter?', ['Post office', 'Stadium', 'Cinema', 'Museum'], 0),
            ],
        },
        {
            id: 'geography',
            title: 'Geography (Maps)',
            blurb: 'Directions and map symbols.',
            questions: [
                q('Which direction is opposite of North?', ['East', 'South', 'West', 'Up'], 1),
                q('A map key/legend shows…', ['Weather', 'Symbols meaning', 'Time', 'Music'], 1),
                q('Which tool helps you find direction?', ['Compass', 'Spoon', 'Eraser', 'Ball'], 0),
                q('The sun rises in the…', ['North', 'South', 'East', 'West'], 2),
                q('A blue line on a map often shows a…', ['Road', 'River', 'Mountain', 'School'], 1),
            ],
        },
    ];

    function q(text, options, correctIndex) {
        return { text, options, correctIndex };
    }

    // --------------------------
    // State
    // --------------------------
    let currentView = 'home';
    let dwellTimer = null;
    let dwellTarget = null;
    let lastWaveX = 0;
    let lastWaveDir = 0;
    let reversalCount = 0;
    let waveWindowStart = 0;

    // Exam state
    let exam = {
        topic: null,
        idx: 0,
        answers: [], // selected option index per question
    };

    // Presentation state
    let ppt = {
        loaded: false,
        currentSlide: 1,
        totalSlides: 0,
        slides: [],      // parsed slides: [{ texts: [], images: [] }]
        fileName: '',
    };

    // --------------------------
    // UI helpers
    // --------------------------
    function formatTime() {
        return new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }

    function showToast(msg, ms = 2600) {
        toastEl.textContent = msg;
        toastEl.hidden = false;
        toastEl.classList.add('visible');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => {
            toastEl.classList.remove('visible');
            toastEl.hidden = true;
        }, ms);
    }

    function log(msg) {
        const li = document.createElement('li');
        li.className = 'log-entry';
        li.innerHTML = `<span class="log-time">${new Date().toLocaleString()}</span><span class="log-text">${msg}</span>`;
        activityLog.prepend(li);
        while (activityLog.children.length > 14) activityLog.removeChild(activityLog.lastChild);
    }

    function setFocus(label, meta = '—') {
        focusLabel.textContent = label;
        focusMeta.textContent = meta;
    }

    function setStatus(text) {
        statusText.textContent = text;
    }

    // --------------------------
    // Dwell (point & hold)
    // --------------------------
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

    function startDwell(el, onFire) {
        clearDwell();
        dwellTarget = el;
        dwellTarget.classList.add('dwell-active');
        dwellTimer = setTimeout(() => {
            clearDwell();
            onFire();
        }, DWELL_MS);
    }

    // --------------------------
    // Wave focus cycling (simple)
    // --------------------------
    function waveTrackerMove(e, onWave) {
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
                onWave();
                reversalCount = 0;
            }
        }
        lastWaveDir = dir;
        lastWaveX = x;
    }

    // --------------------------
    // View switching
    // --------------------------
    function setView(view) {
        currentView = view;
        for (const [k, el] of Object.entries(views)) {
            if (!el) continue;
            el.hidden = k !== view;
        }
        modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === view));
        setFocus(view === 'home' ? 'Home' : view === 'exam' ? 'Exam' : 'Presentation', formatTime());
        log(`View: ${view}`);
    }

    // --------------------------
    // Exam logic
    // --------------------------
    function renderTopics() {
        topicGrid.innerHTML = '';
        TOPICS.forEach((t) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'topic-card';
            btn.dataset.topic = t.id;
            btn.innerHTML = `<strong>${t.title}</strong><small>${t.blurb}</small><span class="dwell-ring" aria-hidden="true"></span>`;
            btn.addEventListener('pointerenter', () => startDwell(btn, () => startExam(t.id)));
            btn.addEventListener('pointerleave', () => clearDwell());
            btn.addEventListener('click', () => startExam(t.id));
            topicGrid.appendChild(btn);
        });
    }

    function startExam(topicId) {
        const t = TOPICS.find((x) => x.id === topicId);
        if (!t) return;
        exam.topic = t;
        exam.idx = 0;
        exam.answers = Array.from({ length: t.questions.length }, () => null);
        examStageTopics.hidden = true;
        examStageResult.hidden = true;
        examStageQuestion.hidden = false;
        examTopicTag.textContent = t.title.toUpperCase();
        setStatus('Exam started — say “option A/B/C/D”');
        setFocus('Exam', `${t.title} · Q1`);
        log(`Exam started: ${t.title}`);
        renderQuestion();
    }

    function renderQuestion() {
        const t = exam.topic;
        if (!t) return;
        const q = t.questions[exam.idx];
        questionText.textContent = q.text;
        questionProgress.textContent = `Question ${exam.idx + 1} of ${t.questions.length}`;
        optionsGrid.innerHTML = '';
        const letters = ['A', 'B', 'C', 'D'];
        q.options.forEach((opt, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'option-btn' + (exam.answers[exam.idx] === i ? ' selected' : '');
            b.dataset.optIndex = String(i);
            b.innerHTML = `<span class="option-key">${letters[i]}</span><span>${opt}</span><span class="dwell-ring" aria-hidden="true"></span>`;
            b.addEventListener('pointerenter', () => startDwell(b, () => selectOption(i)));
            b.addEventListener('pointerleave', () => clearDwell());
            b.addEventListener('click', () => selectOption(i));
            optionsGrid.appendChild(b);
        });
        setFocus('Exam', `${exam.topic.title} · Q${exam.idx + 1}`);
    }

    function selectOption(i) {
        exam.answers[exam.idx] = i;
        
        // Update selection visually without destroying DOM to prevent pointerenter loops
        const opts = Array.from(optionsGrid.querySelectorAll('.option-btn'));
        opts.forEach((btn, idx) => {
            if (idx === i) {
                btn.classList.add('selected', 'sent-ok');
                setTimeout(() => btn.classList.remove('sent-ok'), 600);
            } else {
                btn.classList.remove('selected');
            }
        });

        showToast(`Selected option ${['A', 'B', 'C', 'D'][i]}`);
        log(`Answered Q${exam.idx + 1}: ${['A', 'B', 'C', 'D'][i]}`);
    }

    function nextQuestion() {
        if (!exam.topic) return;
        if (exam.idx < exam.topic.questions.length - 1) {
            exam.idx++;
            renderQuestion();
        } else {
            showToast('Last question — say “submit” when ready.');
        }
    }

    function prevQuestion() {
        if (!exam.topic) return;
        if (exam.idx > 0) {
            exam.idx--;
            renderQuestion();
        }
    }

    function submitExam() {
        const t = exam.topic;
        if (!t) return;
        let correct = 0;
        t.questions.forEach((qq, idx) => {
            if (exam.answers[idx] === qq.correctIndex) correct++;
        });
        const total = t.questions.length;
        const pct = Math.round((correct / total) * 100);
        scoreText.textContent = `${correct} / ${total}`;
        scoreLine.textContent = `Score: ${pct}% — ${pct >= 80 ? 'Excellent' : pct >= 60 ? 'Good job' : 'Keep practicing'}.`;
        examStageQuestion.hidden = true;
        examStageResult.hidden = false;
        setStatus('Exam completed');
        setFocus('Exam result', `${t.title} · ${pct}%`);
        log(`Exam submitted: ${t.title} — ${correct}/${total}`);
    }

    function resetExam() {
        exam = { topic: null, idx: 0, answers: [] };
        examStageTopics.hidden = false;
        examStageQuestion.hidden = true;
        examStageResult.hidden = true;
        setStatus('Ready for voice & gesture');
        setFocus('Exam', 'Choose a topic');
        log('Exam reset');
    }

    // --------------------------
    // Presentation logic (custom JSZip PPTX parser)
    // --------------------------

    /** Safely escape HTML for text node injection */
    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Resolve a slide-relative rels path to a full ZIP path.
     * e.g. Target="../media/image1.png" + base "ppt/slides/" => "ppt/media/image1.png"
     */
    function resolveRelPath(base, target) {
        const parts = (base + target).split('/');
        const resolved = [];
        for (const p of parts) {
            if (p === '..') resolved.pop();
            else if (p !== '.') resolved.push(p);
        }
        return resolved.join('/');
    }

    async function loadPptx(file) {
        ppt.loaded = false;
        ppt.slides = [];
        ppt.fileName = file.name;
        pptStatus.textContent = `Loading "${file.name}"...`;
        pptCanvas.innerHTML = '';
        pptCount.textContent = '-';
        ppt.currentSlide = 1;
        ppt.totalSlides = 0;

        try {
            if (!window.JSZip) {
                pptStatus.textContent = 'JSZip not available - check your internet connection.';
                return;
            }

            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);
            const parser = new DOMParser();

            // 1. Count slides by probing zip entries
            const slideXmlPaths = [];
            let si = 1;
            while (zip.file(`ppt/slides/slide${si}.xml`)) {
                slideXmlPaths.push(`ppt/slides/slide${si}.xml`);
                si++;
            }

            if (slideXmlPaths.length === 0) {
                pptStatus.textContent = 'No slides found inside this PPTX file.';
                return;
            }

            // 2. Parse each slide
            for (let idx = 0; idx < slideXmlPaths.length; idx++) {
                const slideNum = idx + 1;
                const slidePath = slideXmlPaths[idx];

                // 2a. Extract text grouped by paragraph
                const xmlStr = await zip.file(slidePath).async('string');
                const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
                const paragraphs = xmlDoc.querySelectorAll('p');
                const texts = [];
                paragraphs.forEach((para) => {
                    const line = Array.from(para.querySelectorAll('t'))
                        .map((t) => t.textContent)
                        .join('')
                        .trim();
                    if (line) texts.push(line);
                });

                // 2b. Extract embedded images via .rels file
                const images = [];
                const relsFile = zip.file(`ppt/slides/_rels/slide${slideNum}.xml.rels`);
                if (relsFile) {
                    const relsXml = await relsFile.async('string');
                    const relsDoc = parser.parseFromString(relsXml, 'text/xml');
                    for (const rel of relsDoc.querySelectorAll('Relationship')) {
                        const target = rel.getAttribute('Target') || '';
                        if (/\.(png|jpe?g|gif|bmp|webp)$/i.test(target)) {
                            const fullPath = resolveRelPath('ppt/slides/', target);
                            const imgFile = zip.file(fullPath);
                            if (imgFile) {
                                const b64 = await imgFile.async('base64');
                                const ext = target.split('.').pop().toLowerCase();
                                const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
                                    : ext === 'gif' ? 'image/gif'
                                    : ext === 'webp' ? 'image/webp' : 'image/png';
                                images.push(`data:${mime};base64,${b64}`);
                            }
                        }
                    }
                }

                ppt.slides.push({ texts, images });
            }

            ppt.totalSlides = slideXmlPaths.length;
            ppt.loaded = true;
            ppt.currentSlide = 1;
            renderSlide(1);
            updatePptCount();
            const s = ppt.totalSlides;
            pptStatus.textContent = `Loaded: ${file.name} - ${s} slide${s !== 1 ? 's' : ''}. Use Next / Previous to navigate.`;
            log(`Presentation loaded: ${file.name} - ${s} slides`);
            setFocus('Presentation', 'Slide 1');

        } catch (e) {
            console.error('PPTX load error:', e);
            pptStatus.textContent = `Failed to load PPTX: ${e.message || e}`;
        }
    }

    function renderSlide(n) {
        if (!ppt.loaded || !ppt.slides[n - 1]) return;
        const slide = ppt.slides[n - 1];
        let html = '<div class="ppt-slide-render">';

        if (slide.images.length > 0) {
            html += '<div class="ppt-img-row">';
            slide.images.forEach((src) => {
                html += `<img src="${src}" alt="Slide image" class="ppt-img">`;
            });
            html += '</div>';
        }

        if (slide.texts.length > 0) {
            html += `<h2 class="slide-title">${escapeHtml(slide.texts[0])}</h2>`;
            if (slide.texts.length > 1) {
                html += '<ul class="slide-bullets">';
                slide.texts.slice(1).forEach((t) => {
                    html += `<li>${escapeHtml(t)}</li>`;
                });
                html += '</ul>';
            }
        } else if (slide.images.length === 0) {
            html += `<p class="slide-empty">Slide ${n} - no extractable content</p>`;
        }

        html += '</div>';
        pptCanvas.innerHTML = html;
    }

    function updatePptCount() {
        if (!ppt.loaded) { pptCount.textContent = '-'; return; }
        pptCount.textContent = `Slide ${ppt.currentSlide} / ${ppt.totalSlides}`;
    }

    async function gotoSlide(n) {
        if (!ppt.loaded) return;
        const next = Math.max(1, Math.min(ppt.totalSlides, n));
        ppt.currentSlide = next;
        renderSlide(next);
        updatePptCount();
        setFocus('Presentation', `Slide ${ppt.currentSlide}`);
        log(`Slide: ${ppt.currentSlide}`);
    }

    function closePresentation() {
        ppt.loaded = false;
        ppt.slides = [];
        ppt.totalSlides = 0;
        ppt.currentSlide = 1;
        pptCanvas.innerHTML = '';
        pptStatus.textContent = 'Import a PowerPoint file. Use voice: "next slide", "previous slide", "close".';
        pptCount.textContent = '-';
        log('Presentation closed');
    }

    // --------------------------
    // Voice engine
    // --------------------------
    const Voice = {
        recognition: null,
        listening: false,

        init() {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) {
                voiceToggle.disabled = true;
                voiceToggleLabel.textContent = 'Unavailable';
                return;
            }
            this.recognition = new SR();
            this.recognition.continuous = true;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        const text = event.results[i][0].transcript.trim().toLowerCase();
                        this.handle(text);
                    }
                }
            };

            this.recognition.onerror = (event) => {
                if (event.error === 'no-speech') return;
                if (event.error === 'not-allowed') {
                    showToast('Microphone denied — check browser permissions.');
                    this.stop();
                }
            };

            this.recognition.onend = () => {
                if (this.listening) {
                    try { this.recognition.start(); } catch (_) { /* */ }
                }
            };
        },

        toggle() {
            if (!this.recognition) return;
            this.listening ? this.stop() : this.start();
        },

        start() {
            if (!this.recognition || this.listening) return;
            try {
                this.recognition.start();
                this.listening = true;
                voiceToggle.setAttribute('aria-pressed', 'true');
                voiceToggleLabel.textContent = 'Voice on';
                setStatus('Listening…');
                log('Voice: on');
            } catch (_) { /* */ }
        },

        stop() {
            if (!this.recognition) return;
            this.listening = false;
            try { this.recognition.stop(); } catch (_) { /* */ }
            voiceToggle.setAttribute('aria-pressed', 'false');
            voiceToggleLabel.textContent = 'Voice off';
            setStatus('Ready for voice & gesture');
            log('Voice: off');
        },

        handle(text) {
            // Global nav
            if (/\bhome\b/.test(text)) {
                setView('home');
                return;
            }
            if (/\bexam\b/.test(text)) {
                setView('exam');
                return;
            }
            if (/\b(presentation|present)\b/.test(text)) {
                setView('present');
                return;
            }

            // Exam voice controls
            if (currentView === 'exam') {
                if (/\breset\b/.test(text)) {
                    resetExam();
                    return;
                }
                if (/\b(next)\b/.test(text)) {
                    nextQuestion();
                    return;
                }
                if (/\b(previous|back)\b/.test(text)) {
                    prevQuestion();
                    return;
                }
                if (/\bsubmit|finish\b/.test(text)) {
                    submitExam();
                    return;
                }
                // topic selection by name
                const t = TOPICS.find((x) => text.includes(x.title.toLowerCase()) || text.includes(x.id));
                if (t && !exam.topic) {
                    startExam(t.id);
                    return;
                }
                // option select
                const optMatch = text.match(/\b(option\s+)?([abcd])\b/);
                if (optMatch && exam.topic) {
                    const letter = optMatch[2].toUpperCase();
                    const idx = { A: 0, B: 1, C: 2, D: 3 }[letter];
                    if (idx !== undefined) selectOption(idx);
                    return;
                }
            }

            // Presentation voice controls
            if (currentView === 'present') {
                if (/\b(close|exit)\b/.test(text)) {
                    closePresentation();
                    setView('home');
                    return;
                }
                if (/\bnext\b/.test(text)) {
                    gotoSlide(ppt.currentSlide + 1);
                    return;
                }
                if (/\b(previous|back)\b/.test(text)) {
                    gotoSlide(ppt.currentSlide - 1);
                    return;
                }
            }

            showToast(`Heard: “${text}”`);
        },
    };

    // --------------------------
    // Ambient background
    // --------------------------
    function initAmbient() {
        const canvas = document.getElementById('ambientCanvas');
        const ctx = canvas.getContext('2d');
        const particles = [];

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        const count = 55;
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 1.2 + 0.3,
                dx: (Math.random() - 0.5) * 0.22,
                dy: (Math.random() - 0.5) * 0.22,
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

    // --------------------------
    // Event wiring
    // --------------------------
    function init() {
        tick();
        setInterval(tick, 30000);

        initAmbient();
        Voice.init();

        renderTopics();
        setView('home');

        // Sidebar modes
        modeButtons.forEach((b) => {
            b.addEventListener('click', () => setView(b.dataset.mode));
            b.addEventListener('pointerenter', () => startDwell(b, () => setView(b.dataset.mode)));
            b.addEventListener('pointerleave', () => clearDwell());
        });

        // Home action cards
        [goExamCard, goPresentCard].forEach((card) => {
            card.addEventListener('pointerenter', () => startDwell(card, () => setView(card.dataset.action === 'goExam' ? 'exam' : 'present')));
            card.addEventListener('pointerleave', () => clearDwell());
            card.addEventListener('click', () => setView(card.dataset.action === 'goExam' ? 'exam' : 'present'));
        });

        // Wave cycling on home actions (cycles hover ring via focus)
        document.getElementById('homeActions').addEventListener('pointerenter', (e) => {
            lastWaveX = e.clientX;
            lastWaveDir = 0;
            reversalCount = 0;
        });

        // Exam controls
        prevQBtn.addEventListener('click', prevQuestion);
        nextQBtn.addEventListener('click', nextQuestion);
        submitExamBtn.addEventListener('click', submitExam);
        backToTopicsBtn.addEventListener('click', () => {
            resetExam();
            examStageTopics.hidden = false;
        });
        examResetBtn.addEventListener('click', resetExam);

        // Presentation import & nav
        pptInput.addEventListener('change', () => {
            const f = pptInput.files && pptInput.files[0];
            if (f) loadPptx(f);
        });
        pptPrevBtn.addEventListener('click', () => gotoSlide(ppt.currentSlide - 1));
        pptNextBtn.addEventListener('click', () => gotoSlide(ppt.currentSlide + 1));
        pptCloseBtn.addEventListener('click', () => {
            closePresentation();
            setView('home');
        });

        // Voice toggle
        voiceToggle.addEventListener('click', () => Voice.toggle());

        // Reset log
        resetLogBtn.addEventListener('click', () => {
            activityLog.innerHTML = '';
            showToast('Activity cleared');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key.toLowerCase() === 'v') {
                e.preventDefault();
                Voice.toggle();
            }
        });

        // Wave detection: inside topicGrid cycles topics by adding hover class (simple visual)
        topicGrid.addEventListener('pointerenter', (e) => {
            lastWaveX = e.clientX;
            lastWaveDir = 0;
            reversalCount = 0;
        });
        topicGrid.addEventListener('pointermove', (e) => {
            if (currentView !== 'exam' || exam.topic) return;
            waveTrackerMove(e, () => {
                const cards = Array.from(topicGrid.querySelectorAll('.topic-card'));
                if (!cards.length) return;
                const activeIdx = cards.findIndex((c) => c.classList.contains('wave-focus'));
                cards.forEach((c) => c.classList.remove('wave-focus'));
                const next = cards[(activeIdx + 1) % cards.length];
                next.classList.add('wave-focus');
                setStatus('Wave: topic highlighted — hold to start');
            });
        }, { passive: true });

        // Wave detection: inside optionsGrid cycles options
        optionsGrid.addEventListener('pointerenter', (e) => {
            lastWaveX = e.clientX;
            lastWaveDir = 0;
            reversalCount = 0;
        });
        optionsGrid.addEventListener('pointermove', (e) => {
            if (currentView !== 'exam' || !exam.topic) return;
            waveTrackerMove(e, () => {
                const opts = Array.from(optionsGrid.querySelectorAll('.option-btn'));
                if (!opts.length) return;
                const activeIdx = opts.findIndex((c) => c.classList.contains('wave-focus'));
                opts.forEach((c) => c.classList.remove('wave-focus'));
                const next = opts[(activeIdx + 1) % opts.length];
                next.classList.add('wave-focus');
                setStatus('Wave: option highlighted — hold to select');
            });
        }, { passive: true });
    }

    function tick() {
        clockDisplay.textContent = formatTime();
    }

    init();
})();

