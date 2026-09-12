/* ============================================================
   MedVision 3D — Script Engine
   Gesture-Controlled 3D Medical Imaging Viewer
   ============================================================ */

(function () {
    'use strict';

    // ============================
    // Study Data
    // ============================
    const STUDIES = [
        {
            id: 'chest',
            src: 'assets/chest_xray.png',
            title: 'Chest X-Ray — AP View',
            tag: 'X-RAY',
            modality: 'CR',
            bodyPart: 'CHEST',
            kvp: '120',
            mas: '5.0',
            pixel: '0.143mm',
            station: 'DR-ROOM-1',
            notes: 'No acute cardiopulmonary process. Heart size normal. Lungs clear bilaterally.',
            findings: '<strong>Impression:</strong> No acute cardiopulmonary abnormality. Heart size is within normal limits. The lungs are clear bilaterally without focal consolidation, pneumothorax, or pleural effusion.',
            diagnostics: [
                { label: 'Lung Opacity', value: 'Normal', cls: 'normal', pct: 15 },
                { label: 'Cardiac Size', value: 'Normal', cls: 'normal', pct: 42 },
                { label: 'Bone Density', value: 'Moderate', cls: 'attention', pct: 65 },
                { label: 'Image Quality', value: 'Excellent', cls: 'normal', pct: 92 }
            ]
        },
        {
            id: 'brain',
            src: 'assets/brain_mri.png',
            title: 'Brain MRI — Axial T2',
            tag: 'MRI',
            modality: 'MR',
            bodyPart: 'HEAD',
            kvp: 'N/A',
            mas: 'N/A',
            pixel: '0.469mm',
            station: 'MR-SUITE-2',
            notes: 'No intracranial hemorrhage or midline shift. Ventricles are normal in size and configuration.',
            findings: '<strong>Impression:</strong> Normal MRI of the brain. No evidence of acute intracranial abnormality. Gray-white matter differentiation is preserved. No mass lesion, midline shift, or hydrocephalus.',
            diagnostics: [
                { label: 'Gray Matter', value: 'Normal', cls: 'normal', pct: 88 },
                { label: 'Ventricle Size', value: 'Normal', cls: 'normal', pct: 30 },
                { label: 'Signal Intensity', value: 'Uniform', cls: 'normal', pct: 85 },
                { label: 'Image Quality', value: 'Excellent', cls: 'normal', pct: 95 }
            ]
        },
        {
            id: 'hand',
            src: 'assets/hand_xray.png',
            title: 'Hand X-Ray — PA View',
            tag: 'X-RAY',
            modality: 'CR',
            bodyPart: 'HAND',
            kvp: '55',
            mas: '3.2',
            pixel: '0.100mm',
            station: 'DR-ROOM-3',
            notes: 'No fracture or dislocation. Bone mineralization appears normal. Joint spaces preserved.',
            findings: '<strong>Impression:</strong> Normal hand radiograph. No fractures, dislocations, or destructive osseous lesions. Joint spaces are preserved. Soft tissues are unremarkable.',
            diagnostics: [
                { label: 'Bone Integrity', value: 'Normal', cls: 'normal', pct: 95 },
                { label: 'Joint Spaces', value: 'Preserved', cls: 'normal', pct: 88 },
                { label: 'Mineralization', value: 'Adequate', cls: 'normal', pct: 78 },
                { label: 'Image Quality', value: 'Good', cls: 'normal', pct: 82 }
            ]
        },
        {
            id: 'spine',
            src: 'assets/spine_xray.png',
            title: 'Spine X-Ray — Lateral View',
            tag: 'X-RAY',
            modality: 'CR',
            bodyPart: 'SPINE',
            kvp: '80',
            mas: '12.5',
            pixel: '0.171mm',
            station: 'DR-ROOM-1',
            notes: 'Mild degenerative changes at L4-L5. Vertebral body heights are maintained. No listhesis.',
            findings: '<strong>Impression:</strong> Mild degenerative disc disease at L4-L5 with mild disc space narrowing. No acute fracture or malalignment. Vertebral body heights are maintained.',
            diagnostics: [
                { label: 'Disc Height', value: 'Mild Loss', cls: 'attention', pct: 55 },
                { label: 'Alignment', value: 'Normal', cls: 'normal', pct: 90 },
                { label: 'Bone Density', value: 'Moderate', cls: 'attention', pct: 60 },
                { label: 'Image Quality', value: 'Good', cls: 'normal', pct: 80 }
            ]
        }
    ];

    let currentStudyIndex = 0;

    // ============================
    // DOM References
    // ============================
    const mainImage = document.getElementById('mainImage');
    const imageCard = document.getElementById('imageCard');
    const perspectiveContainer = document.getElementById('perspectiveContainer');
    const viewport3d = document.getElementById('viewport3d');
    const crosshair = document.getElementById('crosshair');
    const rotXDisplay = document.getElementById('rotXDisplay');
    const rotYDisplay = document.getElementById('rotYDisplay');
    const imageTitle = document.getElementById('imageTitle');
    const imageModeTag = document.getElementById('imageModeTag');
    const zoomLevel = document.getElementById('zoomLevel');
    const gestureStatusText = document.getElementById('gestureStatusText');
    const clinicalNotes = document.getElementById('clinicalNotes');
    const findingsText = document.getElementById('findingsText');
    const diagnosticItems = document.getElementById('diagnosticItems');
    const dicomMeta = document.getElementById('dicomMeta');
    const fpsCounter = document.getElementById('fpsCounter');
    const brightnessRange = document.getElementById('brightnessRange');
    const contrastRange = document.getElementById('contrastRange');
    const brightnessControl = document.getElementById('brightnessControl');
    const hintBadge = document.getElementById('hintBadge');

    // ============================
    // State
    // ============================
    let currentRotX = 0;
    let currentRotY = 0;
    let targetRotX = 0;
    let targetRotY = 0;
    let currentZoom = 1;
    let targetZoom = 1;
    let currentTransX = 0;
    let currentTransY = 0;
    let targetTransX = 0;
    let targetTransY = 0;
    let isInverted = false;
    let activeTool = 'pan'; // 'pan', 'zoom', 'rotate'
    let mouseX = 0;
    let mouseY = 0;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    // FPS tracking
    let frameCount = 0;
    let lastFpsTime = performance.now();

    // ============================
    // Ambient Particle Background
    // ============================
    const canvas = document.getElementById('ambientCanvas');
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const PARTICLE_COUNT = 60;
    const particles = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.2 + 0.3,
            dx: (Math.random() - 0.5) * 0.25,
            dy: (Math.random() - 0.5) * 0.25,
            opacity: Math.random() * 0.3 + 0.1,
            color: Math.random() > 0.7 ? '123, 97, 255' : '0, 212, 255'
        });
    }

    function drawParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => {
            p.x += p.dx;
            p.y += p.dy;

            if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
            if (p.y < 0 || p.y > canvas.height) p.dy *= -1;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${p.color}, ${p.opacity})`;
            ctx.fill();
        });

        // Draw subtle connecting lines between nearby particles
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(0, 212, 255, ${0.03 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }

    // ============================
    // Crosshair Cursor
    // ============================
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        crosshair.style.left = mouseX + 'px';
        crosshair.style.top = mouseY + 'px';
    });

    // ============================
    // 3D Transform Engine
    // ============================
    function handleViewportMouseMove(e) {
        const rect = viewport3d.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Normalized offset from center (-1 to 1)
        const normX = (x - centerX) / centerX;
        const normY = (y - centerY) / centerY;

        if (activeTool === 'rotate') {
            // 3D Perspective rotation
            const maxAngle = 25;
            targetRotY = normX * maxAngle;
            targetRotX = -normY * maxAngle;
        }

        if (activeTool === 'pan' && isDragging) {
            const deltaX = e.clientX - lastMouseX;
            const deltaY = e.clientY - lastMouseY;
            targetTransX += deltaX * 0.8;
            targetTransY += deltaY * 0.8;
        }

        if (activeTool === 'zoom' && isDragging) {
            const deltaY = e.clientY - lastMouseY;
            targetZoom = Math.max(0.3, Math.min(3, targetZoom - deltaY * 0.005));
        }

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }

    viewport3d.addEventListener('mousemove', handleViewportMouseMove);

    viewport3d.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // Mouse wheel for zoom
    viewport3d.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        targetZoom = Math.max(0.3, Math.min(3, targetZoom + delta));
    }, { passive: false });

    // ============================
    // Animation Loop
    // ============================
    function animate() {
        // Smooth interpolation
        const lerpFactor = 0.08;
        currentRotX += (targetRotX - currentRotX) * lerpFactor;
        currentRotY += (targetRotY - currentRotY) * lerpFactor;
        currentZoom += (targetZoom - currentZoom) * lerpFactor;
        currentTransX += (targetTransX - currentTransX) * lerpFactor;
        currentTransY += (targetTransY - currentTransY) * lerpFactor;

        // Apply 3D transform
        const transform = `
            translateX(${currentTransX}px)
            translateY(${currentTransY}px)
            scale(${currentZoom})
            rotateX(${currentRotX}deg)
            rotateY(${currentRotY}deg)
        `;
        imageCard.style.transform = transform;

        // Update rotation display
        rotXDisplay.textContent = `rotX: ${currentRotX.toFixed(1)}°`;
        rotYDisplay.textContent = `rotY: ${currentRotY.toFixed(1)}°`;

        // Update zoom display
        zoomLevel.textContent = `${currentZoom.toFixed(1)}x`;

        // Draw particles
        drawParticles();

        // FPS counter
        frameCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
            fpsCounter.textContent = frameCount;
            frameCount = 0;
            lastFpsTime = now;
        }

        requestAnimationFrame(animate);
    }

    animate();

    // ============================
    // Study Switching
    // ============================
    function loadStudy(index) {
        if (index < 0 || index >= STUDIES.length) return;
        currentStudyIndex = index;
        const study = STUDIES[index];

        // Animate image transition
        mainImage.classList.remove('image-entering');
        void mainImage.offsetWidth; // force reflow
        mainImage.classList.add('image-entering');

        mainImage.src = study.src;
        mainImage.alt = `Medical Imaging - ${study.title}`;
        imageTitle.textContent = study.title;
        imageModeTag.textContent = study.tag;

        // Update clinical notes
        clinicalNotes.innerHTML = `<p>${study.notes}</p>`;

        // Update findings
        findingsText.innerHTML = `<p>${study.findings}</p>`;

        // Update DICOM metadata
        document.getElementById('metaModality').textContent = study.modality;
        document.getElementById('metaBodyPart').textContent = study.bodyPart;
        document.getElementById('metaKvp').textContent = study.kvp;
        document.getElementById('metaMas').textContent = study.mas;
        document.getElementById('metaPixel').textContent = study.pixel;
        document.getElementById('metaStation').textContent = study.station;

        // Update diagnostics
        diagnosticItems.innerHTML = study.diagnostics.map(d => `
            <div class="diag-item">
                <div class="diag-header">
                    <span class="diag-label">${d.label}</span>
                    <span class="diag-value ${d.cls}">${d.value}</span>
                </div>
                <div class="diag-bar"><div class="diag-fill${d.cls === 'attention' ? ' warning' : ''}" style="width: ${d.pct}%;"></div></div>
            </div>
        `).join('');

        // Update study list (active state)
        document.querySelectorAll('.study-item').forEach((btn, i) => {
            btn.classList.toggle('active', i === index);
        });
        // Deactivate import button and reset its label when switching to a predefined study
        const importBtnEl = document.getElementById('importXrayBtn');
        if (importBtnEl) {
            importBtnEl.classList.remove('active');
            const importSmallEl = importBtnEl.querySelector('.study-info small');
            if (importSmallEl) importSmallEl.textContent = 'Browse from PC';
        }

        // Show right panel and clinical notes (they may have been hidden by import)
        const rightPanelEl = document.getElementById('rightPanel');
        const appLayout = document.querySelector('.app-layout');
        if (rightPanelEl) rightPanelEl.style.display = '';
        if (appLayout) appLayout.style.gridTemplateColumns = '';
        const clinicalNotesSection = clinicalNotes.closest('.sidebar-section');
        if (clinicalNotesSection) clinicalNotesSection.style.display = '';

        // Reset transforms
        targetRotX = 0;
        targetRotY = 0;
        targetZoom = 1;
        targetTransX = 0;
        targetTransY = 0;

        // Reset invert
        if (isInverted) {
            mainImage.classList.remove('image-inverted');
            isInverted = false;
        }

        // Reset brightness/contrast
        brightnessRange.value = 100;
        contrastRange.value = 100;
        mainImage.style.filter = '';
    }

    // Study button clicks
    document.querySelectorAll('.study-item').forEach((btn, i) => {
        btn.addEventListener('click', () => loadStudy(i));
    });

    // ============================
    // Toolbar Controls
    // ============================
    const toolBtns = {
        pan: document.getElementById('toolPan'),
        zoom: document.getElementById('toolZoom'),
        rotate: document.getElementById('toolRotate')
    };

    function setActiveTool(tool) {
        activeTool = tool;
        Object.entries(toolBtns).forEach(([key, btn]) => {
            btn.classList.toggle('active', key === tool);
        });

        if (tool !== 'rotate') {
            targetRotX = 0;
            targetRotY = 0;
        }

        // Update hint
        const hints = {
            pan: 'Move cursor to rotate • Drag to pan image',
            zoom: 'Drag up/down to zoom • Scroll to zoom',
            rotate: 'Move cursor to freely rotate in 3D'
        };
        hintBadge.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            ${hints[tool]}
        `;
    }

    toolBtns.pan.addEventListener('click', () => setActiveTool('pan'));
    toolBtns.zoom.addEventListener('click', () => setActiveTool('zoom'));
    toolBtns.rotate.addEventListener('click', () => setActiveTool('rotate'));

    // Invert
    document.getElementById('toolInvert').addEventListener('click', () => {
        isInverted = !isInverted;
        mainImage.classList.toggle('image-inverted', isInverted);
        document.getElementById('toolInvert').classList.toggle('active', isInverted);
    });

    // Brightness / Window-Level
    document.getElementById('toolBrightness').addEventListener('click', () => {
        const ctrl = brightnessControl;
        const isVisible = ctrl.style.display !== 'none';
        ctrl.style.display = isVisible ? 'none' : 'flex';
        document.getElementById('toolBrightness').classList.toggle('active', !isVisible);
    });

    brightnessRange.addEventListener('input', updateImageFilters);
    contrastRange.addEventListener('input', updateImageFilters);

    function updateImageFilters() {
        const brightness = brightnessRange.value / 100;
        const contrast = contrastRange.value / 100;
        let filter = `brightness(${brightness}) contrast(${contrast})`;
        if (isInverted) {
            filter += ' invert(1) hue-rotate(180deg)';
        }
        mainImage.style.filter = filter;
    }

    // Reset
    document.getElementById('toolReset').addEventListener('click', () => {
        setActiveTool('pan');
        targetRotX = 0;
        targetRotY = 0;
        targetZoom = 1;
        targetTransX = 0;
        targetTransY = 0;
        brightnessRange.value = 100;
        contrastRange.value = 100;
        if (isInverted) {
            isInverted = false;
            mainImage.classList.remove('image-inverted');
            document.getElementById('toolInvert').classList.remove('active');
        }
        mainImage.style.filter = '';
        gestureStatusText.textContent = 'View Reset';
        setTimeout(() => {
            gestureStatusText.textContent = 'Gesture Tracking Active';
        }, 1500);
    });

    // Fullscreen
    document.getElementById('fullscreenBtn').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });

    // ============================
    // Keyboard Shortcuts
    // ============================
    document.addEventListener('keydown', (e) => {
        switch (e.key) {
            case '1': loadStudy(0); break;
            case '2': loadStudy(1); break;
            case '3': loadStudy(2); break;
            case '4': loadStudy(3); break;
            case 'r': case 'R':
                document.getElementById('toolReset').click();
                break;
            case 'i': case 'I':
                document.getElementById('toolInvert').click();
                break;
            case 'p': case 'P':
                setActiveTool('pan');
                break;
            case 'z': case 'Z':
                setActiveTool('zoom');
                break;
            case 'o': case 'O':
                setActiveTool('rotate');
                break;
            case '+': case '=':
                targetZoom = Math.min(3, targetZoom + 0.2);
                break;
            case '-':
                targetZoom = Math.max(0.3, targetZoom - 0.2);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                loadStudy((currentStudyIndex - 1 + STUDIES.length) % STUDIES.length);
                break;
            case 'ArrowRight':
                e.preventDefault();
                loadStudy((currentStudyIndex + 1) % STUDIES.length);
                break;
        }
    });

    // ============================
    // Touch Support (for gesture system cursor simulation)
    // ============================
    viewport3d.addEventListener('touchstart', (e) => {
        isDragging = true;
        const touch = e.touches[0];
        lastMouseX = touch.clientX;
        lastMouseY = touch.clientY;
    }, { passive: true });

    viewport3d.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        const fakeEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY
        };
        handleViewportMouseMove(fakeEvent);
        lastMouseX = touch.clientX;
        lastMouseY = touch.clientY;
    }, { passive: true });

    viewport3d.addEventListener('touchend', () => {
        isDragging = false;
    });

    // ============================
    // Gesture Status Simulation (for demo without backend)
    // ============================
    const gestureMessages = [
        'Gesture Tracking Active',
        'Hand Detected — Tracking',
        'Open Palm — Pan Mode',
        'Pinch Detected — Select',
    ];
    let gestureIndex = 0;

    setInterval(() => {
        gestureIndex = (gestureIndex + 1) % gestureMessages.length;
        gestureStatusText.textContent = gestureMessages[gestureIndex];
    }, 4000);

    // ============================
    // Mouse Leave — Smoothly Reset Rotation
    // ============================
    viewport3d.addEventListener('mouseleave', () => {
        if (activeTool !== 'rotate') {
            // Slowly drift back to center on mouse leave
            targetRotX *= 0.5;
            targetRotY *= 0.5;
        }
    });

    // ============================
    // Import X-Ray from PC
    // ============================
    const importBtn = document.getElementById('importXrayBtn');
    const xrayFileInput = document.getElementById('xrayFileInput');
    let importedCount = 0;

    // Click the import button → trigger hidden file input
    importBtn.addEventListener('click', (e) => {
        e.preventDefault();
        xrayFileInput.click();
    });

    // When a file is selected, load it into the 3D viewer
    xrayFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate it's an image
        if (!file.type.startsWith('image/')) {
            return;
        }

        // Create a blob URL from the selected file
        const blobUrl = URL.createObjectURL(file);

        // Extract filename without extension for display
        const fileName = file.name.replace(/\.[^/.]+$/, '');
        const displayName = fileName.length > 25 ? fileName.substring(0, 25) + '…' : fileName;

        importedCount++;

        // Animate image transition (same as existing studies)
        mainImage.classList.remove('image-entering');
        void mainImage.offsetWidth; // force reflow
        mainImage.classList.add('image-entering');

        // Set the imported image as the main viewer image
        mainImage.src = blobUrl;
        mainImage.alt = `Imported Medical Image - ${displayName}`;
        imageTitle.textContent = `${displayName} — Imported`;
        imageModeTag.textContent = 'IMPORT';

        // Clear the current study index so predefined studies aren't marked
        currentStudyIndex = -1;

        // Update sidebar active states — deactivate all predefined, activate import btn
        document.querySelectorAll('.study-item').forEach(btn => {
            btn.classList.remove('active');
        });
        importBtn.classList.add('active');

        // Update the subtitle label on the import button  
        const importSmall = importBtn.querySelector('.study-info small');
        if (importSmall) {
            importSmall.textContent = displayName;
        }

        // Hide right panel (Diagnostics, DICOM Metadata, Findings) for imported images
        const rightPanelEl = document.getElementById('rightPanel');
        const appLayout = document.querySelector('.app-layout');
        if (rightPanelEl) rightPanelEl.style.display = 'none';
        if (appLayout) appLayout.style.gridTemplateColumns = 'var(--sidebar-width) 1fr';

        // Hide clinical notes section in left sidebar for imported images
        const clinicalNotesSection = clinicalNotes.closest('.sidebar-section');
        if (clinicalNotesSection) clinicalNotesSection.style.display = 'none';

        // Update DICOM counter in header
        const dicomCountEl = document.getElementById('dicomCount');
        dicomCountEl.textContent = STUDIES.length + importedCount;

        // Reset 3D transforms for fresh viewing
        targetRotX = 0;
        targetRotY = 0;
        targetZoom = 1;
        targetTransX = 0;
        targetTransY = 0;

        // Reset invert if active
        if (isInverted) {
            mainImage.classList.remove('image-inverted');
            isInverted = false;
            document.getElementById('toolInvert').classList.remove('active');
        }

        // Reset brightness/contrast
        brightnessRange.value = 100;
        contrastRange.value = 100;
        mainImage.style.filter = '';

        // Clear the file input so the same file can be re-imported if needed
        xrayFileInput.value = '';
    });

    // ============================
    // Initial Load
    // ============================
    loadStudy(0);

    console.log('%c MedVision 3D — Initialized', 'color: #00d4ff; font-weight: bold; font-size: 14px;');
    console.log('%c Gesture-Controlled Medical Imaging Viewer', 'color: #7b61ff; font-size: 11px;');

})();
