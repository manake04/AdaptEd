// ===== AdaptEd — Main Application Script =====
// Orchestrates all modules: AccessibilityEngine, SpeechModule, GestureModule
// Handles UI interactions, API calls, and cross-module communication

document.addEventListener('DOMContentLoaded', () => {
    console.log('[App] AdaptEd loading...');

    // ===== State =====
    const API_BASE = window.location.origin + '/api';
    let lastAction = null;          // For "Repeat" command
    let captionsListening = false;
    let voiceCommandsActive = false;
    let gestureReady = false;
    let voiceSpeed = 1;

    // ===== Voice Speed Control =====
    function getVoiceSpeed() {
        return voiceSpeed;
    }

    window.updateVoiceSpeed = function (val) {
        voiceSpeed = parseFloat(val);
        const label = document.getElementById('speedLabel');
        if (label) label.textContent = voiceSpeed.toFixed(1) + '×';
    };

    // ===== Initialize Core Engine =====
    AccessibilityEngine.init();

    // ===== Profile Selection (global function, called from HTML onclick) =====
    window.selectProfile = function (profile) {
        AccessibilityEngine.setProfile(profile);
        showToast(`Profile set: ${profile.charAt(0).toUpperCase() + profile.slice(1)}`, 'success');

        // Auto-announce for visually impaired
        if (profile === 'visual') {
            setTimeout(() => {
                SpeechModule.speak(`Accessibility profile set to visually impaired. Text to speech and voice navigation are now active. Say a command like "summarize" or "read" to interact.`, getVoiceSpeed());
            }, 500);
        }
    };
    window.showProfileModal = function () {
        AccessibilityEngine.showProfileModal();
    };

    // ===== Profile Change Listener =====
    window.addEventListener('profile-changed', (e) => {
        const { profile, features } = e.detail;

        // Activate/deactivate modules based on features
        if (features.stt || features.captions) {
            activateVoiceSystem();
        } else {
            deactivateVoiceSystem();
        }

        if (features.gestures) {
            initGestureSystem();
        }

        if (features.tts && profile === 'visual') {
            // Already handled above
        }
    });

    // ========================================================
    //  INPUT METHODS
    // ========================================================

    // ===== Switch Input Method (Text / Voice) =====
    window.switchInputMethod = function (method) {
        document.querySelectorAll('.method-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`[data-method="${method}"]`)?.classList.add('active');

        document.getElementById('textInputArea')?.classList.toggle('hidden', method !== 'text');
        document.getElementById('voiceInputArea')?.classList.toggle('hidden', method !== 'voice');
    };

    // ===== Voice Input Mic Button =====
    const voiceMicBtn = document.getElementById('voiceMicBtn');
    const voiceMicLabel = document.getElementById('voiceMicLabel');
    const voiceTranscript = document.getElementById('voiceTranscript');
    let voiceInputListening = false;

    if (voiceMicBtn) {
        voiceMicBtn.addEventListener('click', () => {
            if (voiceInputListening) {
                SpeechModule.stopListening();
                voiceInputListening = false;
                voiceMicBtn.classList.remove('listening');
                voiceMicLabel.textContent = 'Click to start speaking';
            } else {
                const started = SpeechModule.startListening(
                    (final, interim) => {
                        if (voiceTranscript) {
                            voiceTranscript.innerHTML = '';
                            if (final) {
                                voiceTranscript.textContent = final;
                                // Also put into main textarea
                                const ta = document.getElementById('mainTextInput');
                                if (ta) ta.value += (ta.value ? ' ' : '') + final;
                            }
                            if (interim) {
                                const span = document.createElement('span');
                                span.style.color = 'var(--text-muted)';
                                span.textContent = interim;
                                voiceTranscript.appendChild(span);
                            }
                        }
                    },
                    null // No command matching for input mode
                );
                if (started) {
                    voiceInputListening = true;
                    voiceMicBtn.classList.add('listening');
                    voiceMicLabel.textContent = 'Listening... Click to stop';
                }
            }
        });
    }

    // ========================================================
    //  AI PROCESSING (Summarize / Simplify)
    // ========================================================

    function getInputText() {
        return document.getElementById('mainTextInput')?.value?.trim() || '';
    }

    // ===== Summarize =====
    window.handleSummarize = async function () {
        const text = getInputText();
        if (!text) { showToast('Please enter some text first', 'error'); return; }

        const btn = document.getElementById('btnSummarize');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Summarizing...';
        btn.classList.add('loading');

        try {
            const res = await fetch(`${API_BASE}/ai/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            displayOutput(data.summary);
            updateAIStats(data.original_word_count, data.summary_word_count, data.reduction_percent);
            lastAction = { type: 'summarize', text };
            showToast('Text summarized successfully', 'success');

            // Auto-read if TTS is active
            if (AccessibilityEngine.isActive('tts')) {
                SpeechModule.speak(data.summary, getVoiceSpeed());
            }
        } catch (err) {
            displayOutput('Error: ' + err.message);
            showToast('Summarization failed: ' + err.message, 'error');
        }

        btn.innerHTML = '<i class="fas fa-compress-alt"></i> Summarize';
        btn.classList.remove('loading');
    };

    // ===== Simplify =====
    window.handleSimplify = async function () {
        const text = getInputText();
        if (!text) { showToast('Please enter some text first', 'error'); return; }

        const btn = document.getElementById('btnSimplify');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Simplifying...';
        btn.classList.add('loading');

        try {
            const res = await fetch(`${API_BASE}/ai/simplify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            displayOutput(data.simplified);
            lastAction = { type: 'simplify', text };
            showToast('Text simplified successfully', 'success');

            if (AccessibilityEngine.isActive('tts')) {
                SpeechModule.speak(data.simplified, getVoiceSpeed());
            }
        } catch (err) {
            displayOutput('Error: ' + err.message);
            showToast('Simplification failed: ' + err.message, 'error');
        }

        btn.innerHTML = '<i class="fas fa-feather-alt"></i> Simplify';
        btn.classList.remove('loading');
    };

    // ===== Read Aloud =====
    window.handleReadAloud = function () {
        const text = getInputText();
        if (!text) { showToast('No text to read', 'error'); return; }
        SpeechModule.speak(text, getVoiceSpeed());
        lastAction = { type: 'read', text };
        showToast('Reading aloud...', 'info');
    };

    // ===== Clear =====
    window.handleClear = function () {
        document.getElementById('mainTextInput').value = '';
        displayOutput('');
        document.getElementById('aiStats')?.classList.add('hidden');
        SpeechModule.stopSpeaking();
        showToast('Cleared', 'info');
    };

    // ===== Output Display =====
    function displayOutput(text) {
        const area = document.getElementById('outputArea');
        if (!area) return;

        if (!text) {
            area.innerHTML = `
                <div class="output-placeholder">
                    <i class="fas fa-arrow-left"></i>
                    <p>Enter text on the left and click <strong>Summarize</strong> or <strong>Simplify</strong> to see AI-processed output here.</p>
                </div>
            `;
        } else {
            area.textContent = text;
        }
    }

    function updateAIStats(original, result, reduction) {
        document.getElementById('statOriginal').textContent = original;
        document.getElementById('statResult').textContent = result;
        document.getElementById('statReduction').textContent = reduction;
        document.getElementById('aiStats')?.classList.remove('hidden');
    }

    // ===== Copy Output =====
    window.copyOutput = function () {
        const area = document.getElementById('outputArea');
        if (!area) return;
        const text = area.textContent;
        if (!text || text.includes('Enter text on the left')) return;
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard', 'success');
        });
    };

    // ===== Speak Output =====
    window.speakOutput = function () {
        const area = document.getElementById('outputArea');
        if (!area) return;
        const text = area.textContent;
        if (!text || text.includes('Enter text on the left')) return;
        SpeechModule.speak(text, getVoiceSpeed());
    };

    // ===== Stop Speaking =====
    window.stopSpeaking = function () {
        SpeechModule.stopSpeaking();
    };

    // ========================================================
    //  CAPTIONS
    // ========================================================

    window.toggleCaptions = function () {
        if (captionsListening) {
            SpeechModule.stopListening();
            captionsListening = false;
            const btn = document.getElementById('btnCaptionToggle');
            if (btn) btn.innerHTML = '<i class="fas fa-microphone"></i>';
            showToast('Captions stopped', 'info');
        } else {
            const started = SpeechModule.startListening(
                (final, interim) => {
                    const area = document.getElementById('captionsArea');
                    if (!area) return;
                    area.innerHTML = '';
                    if (final) {
                        const p = document.createElement('p');
                        p.textContent = final;
                        p.style.fontWeight = '600';
                        area.appendChild(p);
                    }
                    if (interim) {
                        const p = document.createElement('p');
                        p.textContent = interim;
                        p.style.color = 'var(--text-muted)';
                        area.appendChild(p);
                    }
                },
                null
            );
            if (started) {
                captionsListening = true;
                const btn = document.getElementById('btnCaptionToggle');
                if (btn) btn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                showToast('Live captions active', 'success');
            }
        }
    };

    window.clearCaptions = function () {
        const area = document.getElementById('captionsArea');
        if (area) area.innerHTML = '<p class="caption-placeholder">Captions will appear here in real-time as you speak...</p>';
    };

    // ========================================================
    //  VOICE COMMAND SYSTEM
    // ========================================================

    const voiceCommandBtn = document.getElementById('voiceCommandBtn');
    const voiceCommandStatus = document.getElementById('voiceCommandStatus');
    const voiceCommandTranscript = document.getElementById('voiceCommandTranscript');

    window.toggleVoiceCommands = function () {
        if (voiceCommandsActive) {
            deactivateVoiceSystem();
            showToast('Voice commands disabled', 'info');
        } else {
            activateVoiceSystem();
            showToast('Voice commands active — say a command!', 'success');
        }
    };

    function activateVoiceSystem() {
        const started = SpeechModule.startListening(
            // Transcript callback
            (final, interim) => {
                if (voiceCommandTranscript) {
                    voiceCommandTranscript.innerHTML = '';
                    if (final) voiceCommandTranscript.textContent = `"${final}"`;
                    if (interim) {
                        const span = document.createElement('span');
                        span.style.color = 'var(--text-muted)';
                        span.textContent = interim;
                        voiceCommandTranscript.appendChild(span);
                    }
                }
                // Also update captions if active
                if (AccessibilityEngine.isActive('captions')) {
                    const area = document.getElementById('captionsArea');
                    if (area) {
                        area.innerHTML = '';
                        if (final) { const p = document.createElement('p'); p.textContent = final; area.appendChild(p); }
                        if (interim) { const p = document.createElement('p'); p.textContent = interim; p.style.color = 'var(--text-muted)'; area.appendChild(p); }
                    }
                }
            },
            // Command callback
            (command, rawText) => {
                executeVoiceCommand(command);
                addCommandLog(command.action, command.keyword);
            }
        );

        if (started) {
            voiceCommandsActive = true;
            if (voiceCommandBtn) voiceCommandBtn.classList.add('active');
            if (voiceCommandStatus) voiceCommandStatus.textContent = 'Listening for commands...';
        }
    }

    function deactivateVoiceSystem() {
        SpeechModule.stopListening();
        voiceCommandsActive = false;
        if (voiceCommandBtn) voiceCommandBtn.classList.remove('active');
        if (voiceCommandStatus) voiceCommandStatus.textContent = 'Click to start listening';
    }

    function executeVoiceCommand(command) {
        console.log('[App] Voice Command:', command.action);

        switch (command.action) {
            case 'summarize':
                handleSummarize();
                break;
            case 'read':
                handleReadAloud();
                break;
            case 'simplify':
                handleSimplify();
                break;
            case 'next':
            case 'scroll_down':
                window.scrollBy({ top: 500, behavior: 'smooth' });
                showToast('Scrolling next...', 'info');
                break;
            case 'scroll_up':
                window.scrollBy({ top: -500, behavior: 'smooth' });
                break;
            case 'stop':
                SpeechModule.stopSpeaking();
                showToast('Stopped', 'info');
                break;
            case 'repeat':
                if (lastAction) {
                    if (lastAction.type === 'summarize') handleSummarize();
                    else if (lastAction.type === 'simplify') handleSimplify();
                    else if (lastAction.type === 'read') handleReadAloud();
                    showToast('Repeating last action...', 'info');
                }
                break;
            case 'toggle_contrast':
                toggleHighContrast();
                break;
            case 'clear':
                handleClear();
                break;
        }
        lastAction = { type: command.action };
    }

    function addCommandLog(action, keyword) {
        const log = document.getElementById('commandLog');
        if (!log) return;

        // Remove placeholder
        const placeholder = log.querySelector('.log-placeholder');
        if (placeholder) placeholder.remove();

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `
            <span class="time">${new Date().toLocaleTimeString()}</span>
            <span class="action">${action}</span>
            <span>"${keyword}"</span>
        `;
        log.prepend(entry);

        // Keep only last 10 entries
        while (log.children.length > 10) log.removeChild(log.lastChild);
    }

    // ========================================================
    //  GESTURE SYSTEM
    // ========================================================

    window.startGestureDetection = async function () {
        const video = document.getElementById('gestureVideo');
        const canvas = document.getElementById('gestureCanvas');
        if (!video || !canvas) return;

        // Set canvas size
        canvas.width = 640;
        canvas.height = 480;

        const btnStart = document.getElementById('btnStartGesture');
        const btnStop = document.getElementById('btnStopGesture');
        const status = document.getElementById('gestureStatus');

        if (btnStart) btnStart.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

        if (!gestureReady) {
            const ok = await GestureModule.init(video, canvas, (action, label, gesture) => {
                executeGestureCommand(action, label);
                addGestureLog(label);
            });
            if (!ok) {
                showToast('Failed to initialize gesture detection', 'error');
                if (btnStart) btnStart.innerHTML = '<i class="fas fa-play"></i> Start';
                return;
            }
            gestureReady = true;
        }

        GestureModule.startDetection();
        if (btnStart) btnStart.innerHTML = '<i class="fas fa-play"></i> Start';
        if (status) status.innerHTML = '<span class="dot on"></span> Detecting gestures...';
        showToast('Gesture detection started', 'success');
    };

    window.stopGestureDetection = function () {
        GestureModule.stopDetection();
        const status = document.getElementById('gestureStatus');
        if (status) status.innerHTML = '<span class="dot off"></span> Gesture detection inactive';
        showToast('Gesture detection stopped', 'info');
    };

    function executeGestureCommand(action, label) {
        console.log('[App] Gesture Command:', action);
        showToast(`Gesture: ${label}`, 'info');

        switch (action) {
            case 'next':
                window.scrollBy({ top: 500, behavior: 'smooth' });
                break;
            case 'pause':
                SpeechModule.stopSpeaking();
                break;
            case 'repeat':
                if (lastAction) {
                    if (lastAction.type === 'summarize') handleSummarize();
                    else if (lastAction.type === 'simplify') handleSimplify();
                    else if (lastAction.type === 'read') handleReadAloud();
                }
                break;
        }
    }

    function addGestureLog(label) {
        const log = document.getElementById('gestureLog');
        if (!log) return;

        const placeholder = log.querySelector('.log-placeholder');
        if (placeholder) placeholder.remove();

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `
            <span class="time">${new Date().toLocaleTimeString()}</span>
            <span class="action">${label}</span>
        `;
        log.prepend(entry);

        while (log.children.length > 10) log.removeChild(log.lastChild);
    }

    // ===== Listen for gesture events from GestureModule =====
    window.addEventListener('gesture-command', (e) => {
        // Additional handling if needed
    });

    // ========================================================
    //  UI SETTINGS
    // ========================================================

    window.toggleHighContrast = function () {
        const isOn = document.body.classList.toggle('high-contrast');
        AccessibilityEngine.features.highContrast = isOn;
        const toggle = document.getElementById('toggleContrast');
        if (toggle) toggle.checked = isOn;
        AccessibilityEngine.updateDashboard();
        showToast(isOn ? 'High contrast enabled' : 'High contrast disabled', 'info');
    };

    window.toggleLargeText = function () {
        const current = document.documentElement.getAttribute('data-fontsize');
        const isLarge = current !== 'large';
        document.documentElement.setAttribute('data-fontsize', isLarge ? 'large' : 'normal');
        AccessibilityEngine.features.largeText = isLarge;
        const toggle = document.getElementById('toggleLargeText');
        if (toggle) toggle.checked = isLarge;
        AccessibilityEngine.updateDashboard();
        showToast(isLarge ? 'Large text enabled' : 'Large text disabled', 'info');
    };

    // ========================================================
    //  GESTURE + VOICE AUTO-INIT FOR PROFILES
    // ========================================================

    function initGestureSystem() {
        // Auto-start for motor impaired
        if (AccessibilityEngine.isActive('gestures')) {
            setTimeout(() => startGestureDetection(), 1000);
        }
    }

    // ========================================================
    //  NAVIGATION
    // ========================================================

    // Mobile toggle
    const mobileToggle = document.getElementById('mobileToggle');
    const navLinks = document.getElementById('navLinks');
    if (mobileToggle && navLinks) {
        mobileToggle.addEventListener('click', () => {
            navLinks.classList.toggle('open');
        });
    }

    // Smooth scroll for nav links
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks?.classList.remove('open');
        });
    });

    // ========================================================
    //  TOAST NOTIFICATIONS
    // ========================================================

    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            info: 'fas fa-info-circle'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="${icons[type] || icons.info}"></i> ${message}`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(60px)';
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    // Expose globally for other modules
    window.showToast = showToast;

    // ===== DONE =====
    console.log('[App] AdaptEd loaded successfully');
});
