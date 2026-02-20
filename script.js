// ===== AdaptEd — Script.js =====
// All 7 accessibility features + Backend API Integration

document.addEventListener('DOMContentLoaded', () => {

    // ===== API HELPER & USER ID =====
    const isFileProtocol = window.location.protocol === 'file:';
    const API_BASE = isFileProtocol ? null : (window.location.origin + '/api');

    // Generate or retrieve persistent userId
    function getUserId() {
        let id = localStorage.getItem('adapted-userId');
        if (!id) {
            id = 'user_' + crypto.randomUUID();
            localStorage.setItem('adapted-userId', id);
        }
        return id;
    }
    const userId = getUserId();

    async function apiCall(endpoint, method = 'GET', body = null) {
        if (!API_BASE) return null; // Offline mode for file protocol
        try {
            const options = {
                method,
                headers: { 'Content-Type': 'application/json' }
            };
            if (body) options.body = JSON.stringify(body);
            const res = await fetch(`${API_BASE}${endpoint}`, options);
            return await res.json();
        } catch (err) {
            console.warn('API call failed (offline mode):', err.message);
            return null;
        }
    }

    // API call with timeout — prevents demo from hanging on slow/unresponsive API
    async function apiCallWithTimeout(endpoint, method = 'GET', body = null, timeoutMs = 10000) {
        if (!API_BASE) return null;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const options = {
                method,
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            };
            if (body) options.body = JSON.stringify(body);
            const res = await fetch(`${API_BASE}${endpoint}`, options);
            clearTimeout(timer);
            return await res.json();
        } catch (err) {
            clearTimeout(timer);
            if (err.name === 'AbortError') {
                console.warn(`API call to ${endpoint} timed out after ${timeoutMs}ms`);
            } else {
                console.warn('API call failed:', err.message);
            }
            return null;
        }
    }

    function trackEvent(feature, eventType, metadata = null) {
        apiCall('/analytics/event', 'POST', { userId, feature, eventType, metadata });
    }

    // ===== FEATURE MANAGER (Exclusive Audio + Camera Access) =====
    // Audio and Camera are separate resources — each gets a mutex.
    function stopAudioFeatures(except = null) {
        if (except !== 'stt' && typeof stopSTT === 'function') stopSTT();
        if (except !== 'voiceNav' && voiceNavActive && voiceNavBtn) voiceNavBtn.click();
        if (except !== 'caption' && captionActive && captionPlayBtn) captionPlayBtn.click();
    }

    // Camera mutex — only ONE camera feature at a time (eye tracking OR gesture)
    function stopCameraFeatures(except = null) {
        if (except !== 'eye' && eyeTrackingActive) {
            // Programmatically stop eye tracking
            if (window.webgazer) {
                try { webgazer.end(); } catch (e) { /* ignore */ }
                try { webgazer.showVideoPreview(false); } catch (e) { /* ignore */ }
                try { webgazer.showPredictionPoints(false); } catch (e) { /* ignore */ }
            }
            if (eyeArea) eyeArea.innerHTML = '';
            if (eyeStartBtn) eyeStartBtn.style.display = 'inline-flex';
            if (eyeStopBtn) eyeStopBtn.style.display = 'none';
            if (eyeCalibrateBtn) eyeCalibrateBtn.style.display = 'none';
            if (eyeStatus) eyeStatus.textContent = 'Eye tracking stopped (camera needed elsewhere).';
            eyeTrackingActive = false;
            if (gazeCursor) { gazeCursor.remove(); gazeCursor = null; }
        }
        if (except !== 'gesture' && typeof stopGestureRecognition === 'function') {
            stopGestureRecognition();
        }
    }

    // Check for Secure Context
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        const warning = document.createElement('div');
        warning.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:#d63031;color:white;text-align:center;padding:10px;z-index:9999;';
        warning.textContent = '⚠️ Camera & Microphone require HTTPS. Features may not work on this connection.';
        document.body.prepend(warning);
    }

    // ===== 1. NAVBAR SCROLL EFFECT & ACTIVE SECTION TRACKING =====
    const navbar = document.getElementById('navbar');
    let activeSectionId = 'hero';

    // Throttled scroll handler — uses rAF to avoid layout thrash
    let scrollTicking = false;
    window.addEventListener('scroll', () => {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(() => {
            scrollTicking = false;
            navbar.classList.toggle('scrolled', window.scrollY > 50);

            // Track active section for context-aware gestures + active nav link
            const allSects = document.querySelectorAll('section[id]');
            const scrollY = window.scrollY + 200;
            let current = '';
            allSects.forEach(section => {
                const sectionTop = section.offsetTop;
                const sectionHeight = section.offsetHeight;
                const sectionId = section.getAttribute('id');
                if (window.scrollY >= (sectionTop - 200)) {
                    current = sectionId;
                }
                // Also update active nav link in the same pass
                const navLink = document.querySelector(`.nav-links a[href="#${sectionId}"]`);
                if (navLink) {
                    if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
                        document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
                        navLink.classList.add('active');
                    }
                }
            });
            if (current && current !== activeSectionId) {
                activeSectionId = current;
            }
        });
    });

    // Mobile toggle
    const mobileToggle = document.getElementById('mobileToggle');
    const navLinks = document.getElementById('navLinks');
    mobileToggle.addEventListener('click', () => {
        navLinks.classList.toggle('open');
    });

    // Close mobile nav on link click
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => navLinks.classList.remove('open'));
    });

    // ===== 2. SCROLL REVEAL ANIMATION =====
    const revealElements = document.querySelectorAll('.reveal');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    revealElements.forEach(el => revealObserver.observe(el));

    // ===== 3. SPEECH-TO-TEXT (Feature 1) =====
    const sttMicBtn = document.getElementById('sttMicBtn');
    const sttStatus = document.getElementById('sttStatus');
    const sttTranscript = document.getElementById('sttTranscript');
    const sttSaveBtn = document.getElementById('sttSaveBtn');
    const sttHistoryList = document.getElementById('sttHistoryList');
    let sttRecognition = null;
    let sttListening = false;
    let sttFinalTranscript = '';
    let sttStartTime = null;
    const STT_MAX_SESSION_MS = 120000; // 2-minute max session to prevent infinite listening
    let sttSessionTimer = null;

    // Helper: safely start a recognition instance (prevents permission loop)
    function safeStartRecognition(recognition, onError) {
        try {
            recognition.start();
        } catch (e) {
            console.warn('Recognition start failed:', e.message);
            if (onError) onError(e);
        }
    }

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        sttRecognition = new SpeechRecognition();
        sttRecognition.continuous = true;
        sttRecognition.interimResults = true;
        sttRecognition.lang = 'en-US';

        sttRecognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    sttFinalTranscript += transcript + ' ';
                } else {
                    interim += transcript;
                }
            }
            sttTranscript.innerHTML = sttFinalTranscript +
                (interim ? `<span class="interim">${interim}</span>` : '');
        };

        sttRecognition.onend = () => {
            if (sttListening) {
                // Delay restart slightly to avoid permission loops
                const timeSinceStart = Date.now() - (sttStartTime || 0);
                if (timeSinceStart < 1000) {
                    console.warn('STT ended too quickly, stopping to prevent loop.');
                    stopSTT();
                    return;
                }
                setTimeout(() => {
                    if (sttListening) safeStartRecognition(sttRecognition, () => stopSTT());
                }, 300);
            }
        };

        sttRecognition.onerror = (event) => {
            // Stop on permission or abort errors — prevent endless loop
            if (event.error === 'not-allowed' || event.error === 'aborted' || event.error === 'service-not-allowed') {
                sttStatus.textContent = 'Microphone access denied. Please allow microphone in your browser settings.';
                stopSTT();
                return;
            }
            if (event.error === 'network') {
                sttStatus.textContent = 'Network error. Speech recognition requires internet.';
                stopSTT();
                return;
            }
            if (event.error !== 'no-speech') {
                sttStatus.textContent = `Error: ${event.error}`;
                stopSTT();
            }
        };
    }

    async function startSTT() {
        if (!sttRecognition) {
            sttStatus.textContent = 'Speech recognition not supported in this browser';
            return;
        }
        stopAudioFeatures('stt'); // Stop other mics only
        sttListening = true;
        sttStartTime = Date.now();
        sttMicBtn.classList.add('listening');
        sttStatus.textContent = '🎤 Listening...';
        safeStartRecognition(sttRecognition, (err) => {
            console.error('STT Start Error:', err);
            if (err.error === 'not-allowed') {
                alert('❌ Microphone Access Denied.\nPlease allow microphone permission in your browser settings (look for the lock icon in the address bar).');
            } else if (err.error === 'service-not-allowed') {
                alert('❌ Speech Service Error.\nYour browser does not support speech recognition on this connection.');
            } else {
                alert('❌ STT Error: ' + (err.message || err.error || 'Unknown error'));
            }
            sttStatus.textContent = 'Error starting microphone.';
            stopSTT();
        });
        // Auto-stop after 2 minutes to prevent infinite session
        sttSessionTimer = setTimeout(() => {
            if (sttListening) {
                sttStatus.textContent = '⏰ Session timed out (2 min limit). Click mic to restart.';
                stopSTT();
            }
        }, STT_MAX_SESSION_MS);
        trackEvent('speech_to_text', 'stt_started');
    }

    function stopSTT() {
        sttListening = false;
        if (sttSessionTimer) { clearTimeout(sttSessionTimer); sttSessionTimer = null; }
        sttMicBtn.classList.remove('listening');
        sttStatus.textContent = 'Click the mic to start listening';
        if (sttRecognition) sttRecognition.stop();
        if (sttSaveBtn) sttSaveBtn.style.display = sttFinalTranscript.trim() ? 'inline-flex' : 'none';
    }

    sttMicBtn.addEventListener('click', () => {
        sttListening ? stopSTT() : startSTT();
    });

    // Save transcription to backend
    if (sttSaveBtn) {
        sttSaveBtn.addEventListener('click', async () => {
            const text = sttFinalTranscript.trim();
            if (!text) return;
            const duration = sttStartTime ? (Date.now() - sttStartTime) / 1000 : 0;
            sttSaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            const result = await apiCall('/transcriptions', 'POST', {
                userId, text, language: 'en-US', durationSeconds: duration
            });
            if (result && result.success) {
                sttSaveBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
                loadTranscriptionHistory();
                setTimeout(() => {
                    sttSaveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
                }, 2000);
            } else {
                sttSaveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
            }
        });
    }

    // Load transcription history
    async function loadTranscriptionHistory() {
        if (!sttHistoryList) return;
        const data = await apiCall(`/transcriptions/${userId}?limit=5`);
        if (!data || !data.transcriptions || data.transcriptions.length === 0) {
            sttHistoryList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">No saved transcriptions yet.</p>';
            return;
        }
        sttHistoryList.innerHTML = data.transcriptions.map(t => `
      <div class="history-item" data-id="${t.id}">
        <p class="history-text">${t.text.substring(0, 100)}${t.text.length > 100 ? '...' : ''}</p>
        <div class="history-meta">
          <span>${t.word_count} words</span>
          <span>${new Date(t.created_at).toLocaleDateString()}</span>
          <button class="history-delete" onclick="deleteTranscription(${t.id})">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
    }

    // Make delete function global
    window.deleteTranscription = async (id) => {
        await apiCall(`/transcriptions/${id}`, 'DELETE');
        loadTranscriptionHistory();
    };

    // ===== 4. TEXT-TO-SPEECH (Feature 2) =====
    const ttsInput = document.getElementById('ttsInput');
    const ttsVoice = document.getElementById('ttsVoice');
    const ttsSpeakBtn = document.getElementById('ttsSpeakBtn');
    const ttsStopBtn = document.getElementById('ttsStopBtn');
    const ttsRate = document.getElementById('ttsRate');
    const ttsRateValue = document.getElementById('ttsRateValue');

    let voices = [];

    function loadVoices() {
        voices = speechSynthesis.getVoices();
        ttsVoice.innerHTML = '';
        voices.forEach((voice, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${voice.name} (${voice.lang})`;
            if (voice.default) option.selected = true;
            ttsVoice.appendChild(option);
        });
    }

    speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();

    ttsRate.addEventListener('input', () => {
        ttsRateValue.textContent = parseFloat(ttsRate.value).toFixed(1) + 'x';
    });

    ttsSpeakBtn.addEventListener('click', () => {
        if (speechSynthesis.speaking) speechSynthesis.cancel();
        const text = ttsInput.value.trim();
        if (!text) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voices[ttsVoice.value] || null;
        utterance.rate = parseFloat(ttsRate.value);
        utterance.pitch = 1;
        speechSynthesis.speak(utterance);
        ttsSpeakBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Speaking...';
        trackEvent('text_to_speech', 'tts_used', { wordCount: text.split(/\s+/).length });
        utterance.onend = () => {
            ttsSpeakBtn.innerHTML = '<i class="fas fa-play"></i> Speak';
        };
    });

    ttsStopBtn.addEventListener('click', () => {
        speechSynthesis.cancel();
        ttsSpeakBtn.innerHTML = '<i class="fas fa-play"></i> Speak';
    });

    // ===== 5. ADAPTIVE UI (Feature 3) =====
    const themeBtns = document.querySelectorAll('.theme-btn');
    const sizeBtns = document.querySelectorAll('.size-btn');

    // Save preferences to backend
    function savePrefsToBackend(theme, fontSize, reduceMotion) {
        apiCall('/preferences', 'POST', { userId, theme, fontSize, reduceMotion });
    }

    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            themeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.documentElement.setAttribute('data-theme', btn.dataset.theme);
            localStorage.setItem('adapted-theme', btn.dataset.theme);
            savePrefsToBackend(btn.dataset.theme, null, null);
            trackEvent('adaptive_ui', 'theme_changed', { theme: btn.dataset.theme });

            // Update accessibility panel toggles
            const toggleDark = document.getElementById('toggleDark');
            const toggleHC = document.getElementById('toggleHC');
            toggleDark.classList.toggle('active', btn.dataset.theme === 'dark');
            toggleHC.classList.toggle('active', btn.dataset.theme === 'high-contrast');
        });
    });

    sizeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sizeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.documentElement.setAttribute('data-fontsize', btn.dataset.size);
            localStorage.setItem('adapted-fontsize', btn.dataset.size);
            savePrefsToBackend(null, btn.dataset.size, null);
            trackEvent('adaptive_ui', 'fontsize_changed', { size: btn.dataset.size });
        });
    });

    // Load preferences from backend (fallback to localStorage)
    async function loadPreferences() {
        const data = await apiCall(`/preferences/${userId}`);
        if (data && !data.is_default) {
            document.documentElement.setAttribute('data-theme', data.theme);
            document.documentElement.setAttribute('data-fontsize', data.font_size);
            themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === data.theme));
            sizeBtns.forEach(b => b.classList.toggle('active', b.dataset.size === data.font_size));
        } else {
            // Fallback to localStorage
            const savedTheme = localStorage.getItem('adapted-theme');
            if (savedTheme) {
                document.documentElement.setAttribute('data-theme', savedTheme);
                themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === savedTheme));
            }
            const savedSize = localStorage.getItem('adapted-fontsize');
            if (savedSize) {
                document.documentElement.setAttribute('data-fontsize', savedSize);
                sizeBtns.forEach(b => b.classList.toggle('active', b.dataset.size === savedSize));
            }
        }
    }

    // ===== 6. VOICE NAVIGATION (Feature 4) =====
    const voiceNavBtn = document.getElementById('voiceNavBtn');
    const voiceNavStatus = document.getElementById('voiceNavStatus');
    let voiceNavRecognition = null;
    let voiceNavActive = false;
    let voiceNavStartTime = 0;

    const voiceNavSections = {
        'features': '#features',
        'speech': '#speech-to-text',
        'speech to text': '#speech-to-text',
        'text to speech': '#text-to-speech',
        'tts': '#text-to-speech',
        'adaptive': '#adaptive-ui',
        'adaptive ui': '#adaptive-ui',
        'voice': '#voice-nav',
        'voice navigation': '#voice-nav',
        'eye': '#eye-tracking',
        'eye tracking': '#eye-tracking',
        'summarizer': '#ai-summarizer',
        'ai summarizer': '#ai-summarizer',
        'summarize': '#ai-summarizer',
        'caption': '#auto-caption',
        'captions': '#auto-caption',
        'auto caption': '#auto-caption',
        'home': '#hero',
        'top': '#hero',
    };

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        voiceNavRecognition = new SpeechRecognition();
        voiceNavRecognition.continuous = true;
        voiceNavRecognition.interimResults = false;
        voiceNavRecognition.lang = 'en-US';

        // Spoken feedback for visually impaired users
        function speakFeedback(text) {
            const utter = new SpeechSynthesisUtterance(text);
            utter.rate = 1.2;
            utter.volume = 0.8;
            speechSynthesis.speak(utter);
        }

        voiceNavRecognition.onresult = (event) => {
            const last = event.results[event.results.length - 1];
            const command = last[0].transcript.toLowerCase().trim();
            voiceNavStatus.textContent = `Heard: "${command}"`;

            // Helper for regex matching
            const isCommand = (regex) => regex.test(command);

            // --- SCROLL COMMANDS ---
            if (isCommand(/scroll down|move down|go down|page down/)) {
                window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
                voiceNavStatus.textContent = '⬇️ Scrolling down...';
                speakFeedback('Scrolling down');
            } else if (isCommand(/scroll up|move up|go up|page up/)) {
                window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
                voiceNavStatus.textContent = '⬆️ Scrolling up...';
                speakFeedback('Scrolling up');
            } else if (isCommand(/go to bottom|scroll to bottom|bottom of page|footer/)) {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                voiceNavStatus.textContent = '⬇️ Going to bottom...';
                speakFeedback('Going to bottom of page');
            } else if (isCommand(/go to top|scroll to top|top of page|header/)) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                voiceNavStatus.textContent = '⬆️ Going to top...';
                speakFeedback('Going to top of page');

                // --- INPUT MODE: DICTATION (STT) ---
            } else if (isCommand(/start dictation|start typing|voice typing|start voice input|switch to voice/)) {
                voiceNavStatus.textContent = '🎤 Starting dictation mode...';
                speakFeedback('Starting dictation. Speak and your words will be typed.');
                // Stop voice nav temporarily, start STT
                voiceNavActive = false;
                voiceNavRecognition.stop();
                voiceNavBtn.classList.remove('active');
                setTimeout(() => { startSTT(); }, 500);
            } else if (isCommand(/stop dictation|stop typing|stop voice input|switch to text/)) {
                voiceNavStatus.textContent = '⌨️ Stopped dictation.';
                speakFeedback('Dictation stopped. You can type normally.');
                stopSTT();

                // --- CAPTIONS ---
            } else if (isCommand(/start captions?|turn on captions?|enable captions?/)) {
                voiceNavStatus.textContent = '📝 Starting captions...';
                speakFeedback('Auto captions enabled.');
                if (captionPlayBtn && !captionActive) captionPlayBtn.click();
            } else if (isCommand(/stop captions?|turn off captions?|disable captions?/)) {
                voiceNavStatus.textContent = '📝 Stopping captions.';
                speakFeedback('Auto captions disabled.');
                if (captionPlayBtn && captionActive) captionPlayBtn.click();

                // --- READ PAGE ALOUD (TTS) ---
            } else if (isCommand(/read page|read this|read aloud|read content|read text/)) {
                // Find the current visible section and read its text
                const currentSection = document.querySelector(`section#${activeSectionId}`);
                if (currentSection) {
                    const textContent = currentSection.innerText.substring(0, 1000);
                    voiceNavStatus.textContent = '🔊 Reading current section...';
                    speakFeedback(textContent);
                } else {
                    speakFeedback('No content found to read.');
                }
            } else if (isCommand(/stop reading|stop speaking|be quiet|shut up|silence/)) {
                speechSynthesis.cancel();
                voiceNavStatus.textContent = '🔇 Stopped reading.';

                // --- UI CONTROLS ---
            } else if (isCommand(/increase (font|text)|bigger (font|text)|larger (font|text)|font bigger|text bigger/)) {
                const lgBtn = document.querySelector('.size-btn[data-size="large"]');
                if (lgBtn) lgBtn.click();
                voiceNavStatus.textContent = '🔤 Text size increased.';
                speakFeedback('Text size increased to large.');
            } else if (isCommand(/decrease (font|text)|smaller (font|text)|font smaller|text smaller|normal (font|text)/)) {
                const smBtn = document.querySelector('.size-btn[data-size="normal"]');
                if (smBtn) smBtn.click();
                voiceNavStatus.textContent = '🔤 Text size set to normal.';
                speakFeedback('Text size set to normal.');

            } else if (isCommand(/dark mode|dark theme|enable dark/)) {
                const darkBtn = document.querySelector('.theme-btn[data-theme="dark"]');
                if (darkBtn) darkBtn.click();
                voiceNavStatus.textContent = '🌙 Dark mode enabled.';
                speakFeedback('Dark mode enabled.');
            } else if (isCommand(/light mode|light theme|enable light|normal theme/)) {
                const lightBtn = document.querySelector('.theme-btn[data-theme="default"]');
                if (lightBtn) lightBtn.click();
                voiceNavStatus.textContent = '☀️ Light mode enabled.';
                speakFeedback('Light mode enabled.');
            } else if (isCommand(/high contrast|contrast mode|enable contrast/)) {
                const hcBtn = document.querySelector('.theme-btn[data-theme="high-contrast"]');
                if (hcBtn) hcBtn.click();
                voiceNavStatus.textContent = '🔲 High contrast mode enabled.';
                speakFeedback('High contrast mode enabled.');

                // --- INTERACTION: CLICK ---
            } else if (isCommand(/click|press|select|activate/)) {
                const focused = document.activeElement;
                if (focused && focused !== document.body) {
                    focused.click();
                    voiceNavStatus.textContent = `👆 Clicked: ${focused.tagName}`;
                    speakFeedback('Clicked.');
                } else {
                    voiceNavStatus.textContent = '❓ Nothing focused to click.';
                    speakFeedback('Nothing is focused. Use Tab to focus an element first.');
                }

                // --- TAB / FOCUS NAVIGATION ---
            } else if (isCommand(/next element|tab|next|focus next/)) {
                // Simulate Tab key
                const focusable = Array.from(document.querySelectorAll('button, a, input, select, textarea, [tabindex]'));
                const currentIdx = focusable.indexOf(document.activeElement);
                const nextIdx = (currentIdx + 1) % focusable.length;
                focusable[nextIdx].focus();
                voiceNavStatus.textContent = `➡️ Focused: ${focusable[nextIdx].textContent?.trim().substring(0, 30) || focusable[nextIdx].tagName}`;
                speakFeedback(focusable[nextIdx].getAttribute('aria-label') || focusable[nextIdx].textContent?.trim().substring(0, 50) || 'Next element');
            } else if (isCommand(/previous element|shift tab|previous|focus previous|go back/)) {
                const focusable = Array.from(document.querySelectorAll('button, a, input, select, textarea, [tabindex]'));
                const currentIdx = focusable.indexOf(document.activeElement);
                const prevIdx = (currentIdx - 1 + focusable.length) % focusable.length;
                focusable[prevIdx].focus();
                voiceNavStatus.textContent = `⬅️ Focused: ${focusable[prevIdx].textContent?.trim().substring(0, 30) || focusable[prevIdx].tagName}`;
                speakFeedback(focusable[prevIdx].getAttribute('aria-label') || focusable[prevIdx].textContent?.trim().substring(0, 50) || 'Previous element');

                // --- HELP ---
            } else if (isCommand(/help|what can (i|you) (say|do)|commands|list commands/)) {
                voiceNavStatus.textContent = '📋 Listing available voice commands...';
                speakFeedback('Available commands: scroll up, scroll down, go to top, go to bottom, go to any section name, start dictation, stop dictation, start captions, stop captions, read page, stop reading, increase font, decrease font, dark mode, light mode, high contrast, click, next, previous, help, stop listening.');

                // --- STOP ---
            } else if (isCommand(/stop listening|stop voice|turn off voice/)) {
                speakFeedback('Voice navigation stopped.');
                voiceNavBtn.click();

                // --- SECTION NAVIGATION (fallback) ---
            } else {
                let foundFn = false;
                for (const [key, selector] of Object.entries(voiceNavSections)) {
                    if (command.includes(key)) {
                        const el = document.querySelector(selector);
                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth' });
                            voiceNavStatus.textContent = `✅ Navigated to "${key}"`;
                            speakFeedback(`Navigated to ${key}`);
                            trackEvent('voice_navigation', 'nav_command', { command: key });
                            foundFn = true;
                        }
                        break;
                    }
                }
                if (!foundFn) {
                    voiceNavStatus.textContent = `❓ Unknown command: "${command}". Say "help" for a list.`;
                    speakFeedback(`Unknown command: ${command}. Say help for available commands.`);
                }
            }
        };

        voiceNavRecognition.onend = () => {
            if (voiceNavActive) {
                // Prevent rapid loops
                if (Date.now() - voiceNavStartTime < 1000) {
                    console.warn('Voice Nav ended too quickly, stopping.');
                    voiceNavActive = false;
                    voiceNavBtn.classList.remove('active');
                    voiceNavStatus.textContent = 'Voice nav stopped (error/permission).';
                    return;
                }
                setTimeout(() => {
                    if (voiceNavActive) safeStartRecognition(voiceNavRecognition, () => {
                        voiceNavActive = false;
                        voiceNavBtn.classList.remove('active');
                        voiceNavStatus.textContent = 'Voice nav stopped (mic error)';
                    });
                }, 300);
            }
        };

        voiceNavRecognition.onerror = (event) => {
            if (event.error === 'not-allowed' || event.error === 'aborted' || event.error === 'service-not-allowed') {
                voiceNavActive = false;
                voiceNavBtn.classList.remove('active');
                voiceNavStatus.textContent = 'Microphone access denied.';
                return;
            }
            if (event.error === 'network') {
                voiceNavActive = false;
                voiceNavBtn.classList.remove('active');
                voiceNavStatus.textContent = 'Network error. Check internet connection.';
                return;
            }
            if (event.error !== 'no-speech') {
                voiceNavStatus.textContent = `Error: ${event.error}`;
            }
        };
    }

    voiceNavBtn.addEventListener('click', async () => {
        if (!voiceNavRecognition) {
            voiceNavStatus.textContent = 'Speech recognition not supported';
            return;
        }
        if (voiceNavActive) {
            voiceNavActive = false;
            voiceNavRecognition.stop();
            voiceNavBtn.classList.remove('active');
            voiceNavStatus.textContent = 'Click to activate voice navigation';
        } else {
            stopAudioFeatures('voiceNav'); // Stop other mics only
            voiceNavActive = true;
            voiceNavStartTime = Date.now();
            voiceNavStatus.textContent = '🎤 Listening for commands...';
            safeStartRecognition(voiceNavRecognition, (err) => {
                console.error('VoiceNav Start Error:', err);
                if (err.error === 'not-allowed') {
                    alert('❌ Voice Nav Permission Denied.\nPlease allow microphone access.');
                } else {
                    alert('❌ Voice Nav Error: ' + (err.message || err.error));
                }
                voiceNavActive = false;
                voiceNavStatus.textContent = 'Failed to start voice navigation';
                voiceNavBtn.classList.remove('active');
            });
            voiceNavBtn.classList.add('active');
            trackEvent('voice_navigation', 'voicenav_started');
        }
    });

    // ===== GLOBAL KEYBOARD SHORTCUT: Alt+V to toggle Voice Navigation =====
    document.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 'v' || e.key === 'V')) {
            e.preventDefault();
            voiceNavBtn.click();
        }
    });

    // ===== 7. EYE TRACKING (Feature 5 — WebGazer.js) =====
    const eyeArea = document.getElementById('eyeArea');
    const eyeTargets = document.querySelectorAll('.eye-target');
    const eyeStatus = document.getElementById('eyeStatus');
    const eyeStartBtn = document.getElementById('eyeStartBtn');
    const eyeStopBtn = document.getElementById('eyeStopBtn');
    const eyeCalibrateBtn = document.getElementById('eyeCalibrateBtn');
    let eyeTrackingActive = false;
    let gazeCursor = null; // Module-scope ref for the gaze cursor element

    // Smoothing Variables
    const SMOOTHING_FACTOR = 0.2; // Lower = more smoothing (less jitter, more lag)
    let currentGazeX = 0;
    let currentGazeY = 0;


    function getSmoothedGaze(newX, newY) {
        // Initialize if first frame
        if (currentGazeX === 0 && currentGazeY === 0) {
            currentGazeX = newX;
            currentGazeY = newY;
            return { x: newX, y: newY };
        }
        // Weighted Moving Average (Exponential)
        currentGazeX = (newX * SMOOTHING_FACTOR) + (currentGazeX * (1 - SMOOTHING_FACTOR));
        currentGazeY = (newY * SMOOTHING_FACTOR) + (currentGazeY * (1 - SMOOTHING_FACTOR));
        return { x: currentGazeX, y: currentGazeY };
    }

    // Initialize WebGazer
    async function initEyeTracking() {
        if (!window.webgazer) {
            eyeStatus.textContent = 'WebGazer library not found. Check internet.';
            return;
        }

        // Clear previous listeners to avoid duplicates if restarted
        try { webgazer.clearGazeListener(); } catch (e) { /* ignore if not started yet */ }
        webgazer.clearData();

        webgazer.setGazeListener(function (data, elapsedTime) {
            if (data == null) return;

            // Get smoothed gaze coordinates
            const smoothed = getSmoothedGaze(data.x, data.y);
            const x = smoothed.x;
            const y = smoothed.y;

            // Update Gaze Cursor (use module-scope gazeCursor ref)
            if (!gazeCursor) {
                gazeCursor = document.createElement('div');
                gazeCursor.id = 'gazeCursor';
                gazeCursor.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 22px; height: 22px;
                    border: 3px solid #e74c3c; border-radius: 50%; pointer-events: none; z-index: 99999;
                    box-shadow: 0 0 10px rgba(231, 76, 60, 0.5); transition: all 0.1s ease;
                    transform: translate(-50%, -50%);
                `;
                document.body.appendChild(gazeCursor);
            }
            gazeCursor.style.left = `${x}px`;
            gazeCursor.style.top = `${y}px`;
            gazeCursor.style.transform = 'translate(-50%, -50%)';

            // Highlight targets based on gaze
            let lookingAtSomething = false;
            eyeTargets.forEach(target => {
                const rect = target.getBoundingClientRect();
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    lookingAtSomething = true;
                    if (!target.classList.contains('hovered')) {
                        target.classList.add('hovered');
                        eyeStatus.textContent = `👀 Looking at: ${target.dataset.target}`;
                        eyeStatus.style.color = '#00b894';
                        trackEvent('eye_tracking', 'gaze_target', { target: target.dataset.target });

                        gazeCursor.style.background = 'rgba(231, 76, 60, 0.3)';
                    }
                } else {
                    target.classList.remove('hovered');
                }
            });

            if (!lookingAtSomething) {
                eyeStatus.textContent = '✅ Face Detected — Tracking Eyes...';
                eyeStatus.style.color = 'var(--text-secondary)';
                if (gazeCursor) gazeCursor.style.background = 'transparent';
            }
        }).begin();

        // Load saved calibration if available
        // WebGazer saves data to localStorage automatically, but we can ensure models are ready
        // if (localStorage.getItem('webgazerGlobalData')) { ... } 

        // Setup calibration UI
        setupCalibration();
    }

    function setupCalibration() {
        // Simple calibration: 9 points
        eyeArea.innerHTML = '';
        const points = [
            { x: '10%', y: '10%' }, { x: '50%', y: '10%' }, { x: '90%', y: '10%' },
            { x: '10%', y: '50%' }, { x: '50%', y: '50%' }, { x: '90%', y: '50%' },
            { x: '10%', y: '90%' }, { x: '50%', y: '90%' }, { x: '90%', y: '90%' }
        ];

        points.forEach((p, i) => {
            const dot = document.createElement('div');
            dot.className = 'calibration-dot';
            dot.style.cssText = `
                position: absolute; left: ${p.x}; top: ${p.y}; width: 20px; height: 20px;
                background: red; border-radius: 50%; border: 2px solid white; cursor: pointer;
                transform: translate(-50%, -50%); opacity: 0.7;
            `;
            dot.dataset.clicks = 0;
            dot.addEventListener('click', (e) => {
                const clicks = parseInt(dot.dataset.clicks) + 1;
                dot.dataset.clicks = clicks;
                dot.style.opacity = 1;
                dot.style.transform = `translate(-50%, -50%) scale(${1 + clicks * 0.2})`;
                if (clicks >= 5) { // Updated to 5 clicks as per instructions
                    dot.style.background = '#00b894'; // Green when calibrated
                    dot.style.cursor = 'default';
                    dot.style.pointerEvents = 'none'; // Prevent further clicks
                }
            });
            eyeArea.appendChild(dot);
        });

        // Show video preview for feedback
        webgazer.showVideoPreview(true);
        webgazer.showPredictionPoints(true);

        // Position video preview in the corner
        const video = document.getElementById('webgazerVideoFeed');
        if (video) {
            video.style.position = 'fixed';
            video.style.bottom = '10px';
            video.style.right = '10px';
            video.style.zIndex = '9999';
            video.style.width = '200px';
            video.style.height = 'auto';
        }
    }

    eyeStartBtn.addEventListener('click', () => {
        stopCameraFeatures('eye'); // Stop gesture camera if running
        eyeStatus.textContent = 'starting eye tracking...';
        initEyeTracking();
        eyeStartBtn.style.display = 'none';
        eyeStopBtn.style.display = 'inline-flex';
        eyeCalibrateBtn.style.display = 'inline-flex';
        eyeStatus.textContent = 'Click EACH red dot 5 times until they turn green. look at the cursor.';
        trackEvent('eye_tracking', 'eye_started');
        eyeTrackingActive = true;
    });

    eyeStopBtn.addEventListener('click', () => {
        if (window.webgazer) {
            try { webgazer.clearGazeListener(); } catch (e) { /* ignore */ }
            try { webgazer.end(); } catch (e) { /* ignore */ }
            try { webgazer.showVideoPreview(false); } catch (e) { /* ignore */ }
            try { webgazer.showPredictionPoints(false); } catch (e) { /* ignore */ }
        }
        eyeArea.innerHTML = '';
        eyeStartBtn.style.display = 'inline-flex';
        eyeStopBtn.style.display = 'none';
        eyeCalibrateBtn.style.display = 'none';
        eyeStatus.textContent = 'Eye tracking stopped.';
        eyeTrackingActive = false;

        if (gazeCursor) { gazeCursor.remove(); gazeCursor = null; }
    });

    eyeCalibrateBtn.addEventListener('click', () => {
        setupCalibration(); // Reset calibration points
        eyeStatus.textContent = 'Calibration reset. Click points again.';
    });

    const eyeDebugBtn = document.getElementById('eyeDebugBtn');
    if (eyeDebugBtn) {
        eyeDebugBtn.addEventListener('click', async () => {
            let log = "🔍 Debug Report 🔍\n";

            // 1. Connection Protocol
            const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
            log += `1. Protocol: ${window.location.protocol} (${isSecure ? '✅ OK' : '❌ Needs HTTPS or Localhost'})\n`;

            // 2. WebGazer Library
            if (window.webgazer) {
                log += "2. WebGazer Lib: ✅ Loaded\n";
            } else {
                log += "2. WebGazer Lib: ❌ NOT FOUND (Check Internet/AdBlock)\n";
            }

            // 3. Camera Permissions
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                log += "3. Camera Access: ✅ Granted (Stream Active)\n";
                // Stop the test stream immediately
                stream.getTracks().forEach(track => track.stop());
            } catch (e) {
                log += `3. Camera Access: ❌ FAILED (${e.name}: ${e.message})\n`;
                if (e.name === 'NotAllowedError') log += "   -> Please allow camera in browser settings.\n";
                if (e.name === 'NotFoundError') log += "   -> No camera hardware found.\n";
            }

            alert(log);
        });
    }

    // ===== 8. AI SUMMARIZER — Backend API (Feature 6) =====
    const summarizeBtn = document.getElementById('summarizeBtn');
    const summarizerInput = document.getElementById('summarizerInput');
    const summaryOutput = document.getElementById('summaryOutput');

    // Client-side fallback
    function extractiveSummarize(text, numSentences = 3) {
        const sentences = text.match(/[^.!?]+[.!?]+/g);
        if (!sentences || sentences.length <= numSentences) return text;
        const stopWords = new Set([
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
            'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can',
            'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
            'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again',
            'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
            'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same',
            'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or', 'if', 'while', 'this',
            'that', 'these', 'those', 'it', 'its', 'which', 'who', 'whom', 'what', 'their', 'they',
            'them', 'he', 'she', 'his', 'her', 'need', 'used'
        ]);
        const wordFreq = {};
        text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(w => {
            if (!stopWords.has(w) && w.length > 2) wordFreq[w] = (wordFreq[w] || 0) + 1;
        });
        const scored = sentences.map((s, i) => {
            const words = s.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
            let score = words.reduce((a, w) => a + (wordFreq[w] || 0), 0) / Math.max(words.length, 1);
            if (i < 2) score *= 1.3;
            return { sentence: s.trim(), score, index: i };
        });
        return scored.sort((a, b) => b.score - a.score).slice(0, numSentences)
            .sort((a, b) => a.index - b.index).map(s => s.sentence).join(' ');
    }

    // AI toggle and status badge
    const aiToggle = document.getElementById('aiToggle');
    const aiStatusBadge = document.getElementById('aiStatusBadge');

    // Check Gemini AI status on load
    async function checkAIStatus() {
        const status = await apiCall('/ai/status');
        if (status && status.configured) {
            if (aiStatusBadge) {
                aiStatusBadge.style.display = 'inline';
                aiStatusBadge.textContent = '✅ AI Ready';
            }
        } else {
            if (aiStatusBadge) {
                aiStatusBadge.style.display = 'inline';
                aiStatusBadge.textContent = '⚠️ AI Not Configured';
                aiStatusBadge.style.background = 'rgba(255,234,167,0.15)';
                aiStatusBadge.style.color = '#fdcb6e';
            }
            if (aiToggle) aiToggle.checked = false;
        }
    }

    summarizeBtn.addEventListener('click', async () => {
        const text = summarizerInput.value.trim();
        if (!text) {
            summaryOutput.innerHTML = '<span style="color: var(--text-muted);">Please enter some text to summarize.</span>';
            return;
        }

        summaryOutput.innerHTML = '<div class="loading"><div class="spinner"></div> Analyzing and summarizing...</div>';
        trackEvent('ai_summarizer', 'summarize_requested');

        const useAI = aiToggle && aiToggle.checked;

        // Strategy: AI toggle ON → try Gemini first (with 10s timeout) → extractive backend → client-side
        let result = null;

        if (useAI) {
            summaryOutput.innerHTML = '<div class="loading"><div class="spinner"></div> ✨ Generating AI summary with Gemini...</div>';
            // Gemini API call with 10s timeout to prevent hanging demo
            result = await apiCallWithTimeout('/ai/summarize', 'POST', { userId, text, style: 'concise' }, 10000);
        }

        if (!result || result.error) {
            if (useAI) {
                summaryOutput.innerHTML = '<div class="loading"><div class="spinner"></div> AI unavailable, using extractive method...</div>';
            }
            result = await apiCallWithTimeout('/summarize', 'POST', { userId, text, numSentences: 3 }, 8000);
        }

        if (result && result.summary) {
            const source = result.ai_powered
                ? '✨ Powered by Gemini AI (abstractive)'
                : '🔗 Processed with TF-IDF algorithm (extractive)';
            summaryOutput.innerHTML = `
                <p style="margin-bottom: 12px;">${result.summary}</p>
                <p style="font-size: 0.8rem; color: var(--accent-secondary); margin-top: 8px;">
                    📊 Reduced from ${result.original_word_count} to ${result.summary_word_count} words (${result.reduction_percent}% reduction)
                    <br>${source}
                </p>
            `;
        } else {
            // Final fallback: client-side
            setTimeout(() => {
                const summary = extractiveSummarize(text);
                const origWC = text.split(/\s+/).length;
                const sumWC = summary.split(/\s+/).length;
                summaryOutput.innerHTML = `
                    <p style="margin-bottom: 12px;">${summary}</p>
                    <p style="font-size: 0.8rem; color: var(--accent-secondary); margin-top: 8px;">
                        📊 Reduced from ${origWC} to ${sumWC} words (${Math.round((1 - sumWC / origWC) * 100)}% reduction)
                        <br>⚡ Processed client-side (offline mode)
                    </p>
                `;
            }, 800);
        }
    });

    // ===== 9. AUTO CAPTION (Feature 7) =====
    const captionPlayBtn = document.getElementById('captionPlayBtn');
    const captionText = document.getElementById('captionText');
    const captionToggle = document.getElementById('captionToggle');
    const captionLang = document.getElementById('captionLang');
    const captionOverlay = document.getElementById('captionOverlay');
    let captionRecognition = null;
    let captionActive = false;
    let captionsEnabled = true;
    let captionStartTime = 0;

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        captionRecognition = new SpeechRecognition();
        captionRecognition.continuous = true;
        captionRecognition.interimResults = true;

        captionRecognition.onresult = (event) => {
            if (!captionsEnabled) return;
            let final = '';
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) final += t;
                else interim += t;
            }
            captionText.textContent = interim || final || 'Listening...';
        };

        captionRecognition.onend = () => {
            if (captionActive) {
                if (Date.now() - captionStartTime < 1000) {
                    console.warn('Captioning ended too quickly, stopping.');
                    captionActive = false;
                    captionPlayBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                    captionText.textContent = 'Captioning stopped (error/permission).';
                    return;
                }
                setTimeout(() => {
                    if (captionActive) safeStartRecognition(captionRecognition, () => {
                        captionActive = false;
                        captionPlayBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                        captionText.textContent = 'Captioning stopped (mic error)';
                    });
                }, 300);
            }
        };

        captionRecognition.onerror = (event) => {
            if (event.error === 'not-allowed' || event.error === 'aborted' || event.error === 'service-not-allowed') {
                captionActive = false;
                captionPlayBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                captionText.textContent = 'Microphone access denied.';
                return;
            }
            if (event.error === 'network') {
                captionActive = false;
                captionPlayBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                captionText.textContent = 'Network error. Internet required for captions.';
                return;
            }
            if (event.error !== 'no-speech') {
                captionText.textContent = `Error: ${event.error}`;
            }
        };
    }

    captionPlayBtn.addEventListener('click', async () => {
        if (!captionRecognition) {
            captionText.textContent = 'Speech recognition not supported';
            return;
        }
        if (captionActive) {
            captionActive = false;
            captionRecognition.stop();
            captionPlayBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            captionText.textContent = 'Captions paused. Click to resume.';
        } else {
            stopAudioFeatures('caption'); // Stop other mics only
            captionActive = true;
            captionStartTime = Date.now();
            captionRecognition.lang = captionLang.value;
            safeStartRecognition(captionRecognition, (err) => {
                console.error('Caption Start Error:', err);
                captionActive = false;
                captionText.textContent = 'Failed to start captions';
                captionPlayBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            });
            captionPlayBtn.innerHTML = '<i class="fas fa-stop"></i>';
            captionText.textContent = 'Listening...';
            trackEvent('auto_caption', 'caption_started');
        }
    });

    captionToggle.addEventListener('click', () => {
        captionsEnabled = !captionsEnabled;
        captionToggle.classList.toggle('active', captionsEnabled);
        captionToggle.innerHTML = `<i class="fas fa-closed-captioning"></i> Captions: ${captionsEnabled ? 'ON' : 'OFF'}`;
        captionOverlay.style.display = captionsEnabled ? 'block' : 'none';
    });
    captionToggle.classList.add('active');

    captionLang.addEventListener('change', () => {
        if (captionActive && captionRecognition) {
            captionRecognition.stop();
            captionRecognition.lang = captionLang.value;
        }
    });

    // ===== 10. FLOATING ACCESSIBILITY PANEL =====
    const a11yToggle = document.getElementById('a11yToggle');
    const a11yMenu = document.getElementById('a11yMenu');

    a11yToggle.addEventListener('click', () => {
        a11yMenu.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.accessibility-panel')) {
            a11yMenu.classList.remove('open');
        }
    });

    const toggleDark = document.getElementById('toggleDark');
    const toggleHC = document.getElementById('toggleHC');
    const toggleLargeText = document.getElementById('toggleLargeText');
    const toggleMotion = document.getElementById('toggleMotion');

    toggleDark.addEventListener('click', () => {
        toggleDark.classList.toggle('active');
        toggleHC.classList.remove('active');
        const theme = toggleDark.classList.contains('active') ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
        savePrefsToBackend(theme, null, null);
    });

    toggleHC.addEventListener('click', () => {
        toggleHC.classList.toggle('active');
        const theme = toggleHC.classList.contains('active') ? 'high-contrast' : 'dark';
        if (theme === 'high-contrast') toggleDark.classList.remove('active');
        else toggleDark.classList.add('active');
        document.documentElement.setAttribute('data-theme', theme);
        themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
        savePrefsToBackend(theme, null, null);
    });

    toggleLargeText.addEventListener('click', () => {
        toggleLargeText.classList.toggle('active');
        const size = toggleLargeText.classList.contains('active') ? 'large' : 'normal';
        document.documentElement.setAttribute('data-fontsize', size);
        sizeBtns.forEach(b => b.classList.toggle('active', b.dataset.size === size));
        savePrefsToBackend(null, size, null);
    });

    toggleMotion.addEventListener('click', () => {
        toggleMotion.classList.toggle('active');
        if (toggleMotion.classList.contains('active')) {
            document.documentElement.style.setProperty('--transition-fast', '0s');
            document.documentElement.style.setProperty('--transition-medium', '0s');
            document.documentElement.style.setProperty('--transition-slow', '0s');
            document.querySelectorAll('.orb').forEach(o => o.style.animation = 'none');
            savePrefsToBackend(null, null, true);
        } else {
            document.documentElement.style.removeProperty('--transition-fast');
            document.documentElement.style.removeProperty('--transition-medium');
            document.documentElement.style.removeProperty('--transition-slow');
            document.querySelectorAll('.orb').forEach(o => o.style.animation = '');
            savePrefsToBackend(null, null, false);
        }
    });

    // ===== 12. GESTURE RECOGNITION (Feature 8 — MediaPipe Hands) =====
    const gestureStartBtn = document.getElementById('gestureStartBtn');
    const gestureStopBtn = document.getElementById('gestureStopBtn');
    const gestureStatus = document.getElementById('gestureStatus');
    const gestureVideo = document.getElementById('gestureVideo');
    const gestureCanvas = document.getElementById('gestureCanvas');
    const gestureEmoji = document.getElementById('gestureEmoji');
    const gestureLabel = document.getElementById('gestureLabel');
    const gestureIndicator = document.getElementById('gestureIndicator');
    let gestureCamera = null;
    let gestureStream = null;
    let lastGesture = '';
    let gestureDebounce = 0;

    // Gesture smoothing: require N consecutive frames of the same gesture before triggering
    const GESTURE_CONFIRM_FRAMES = 3;
    let gestureBuffer = [];
    let confirmedGesture = null;

    function getSmoothedGesture(currentGesture) {
        gestureBuffer.push(currentGesture.name);
        if (gestureBuffer.length > GESTURE_CONFIRM_FRAMES) {
            gestureBuffer.shift();
        }
        // All recent frames must agree
        if (gestureBuffer.length === GESTURE_CONFIRM_FRAMES &&
            gestureBuffer.every(g => g === currentGesture.name)) {
            if (confirmedGesture !== currentGesture.name) {
                confirmedGesture = currentGesture.name;
                return currentGesture; // New confirmed gesture
            }
        }
        return null; // Not yet confirmed or same as last
    }

    // Helper: distance between two landmarks
    function landmarkDist(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2);
    }

    // Gesture classification from hand landmarks
    function classifyGesture(landmarks) {
        // Landmark indices: 0=wrist, 4=thumb_tip, 8=index_tip, 12=middle_tip, 16=ring_tip, 20=pinky_tip
        // PIP joints: 6=index_pip, 10=middle_pip, 14=ring_pip, 18=pinky_pip
        // MCP joints: 5=index_mcp, 9=middle_mcp, 13=ring_mcp, 17=pinky_mcp
        // DIP joints: 7=index_dip, 11=middle_dip, 15=ring_dip, 19=pinky_dip

        const tips = [8, 12, 16, 20];       // index, middle, ring, pinky tips
        const pips = [6, 10, 14, 18];       // PIP joints
        const mcps = [5, 9, 13, 17];        // MCP joints

        // Check if each finger is extended (tip above PIP in y-axis, lower y = higher on screen)
        const fingersExtended = tips.map((tip, i) => {
            return landmarks[tip].y < landmarks[pips[i]].y;
        });

        // Thumb: check if thumb tip is farther from palm than thumb IP joint
        const thumbExtended = Math.abs(landmarks[4].x - landmarks[2].x) > Math.abs(landmarks[3].x - landmarks[2].x);

        // Thumb tip is above the wrist (pointing upward)
        const thumbPointingUp = landmarks[4].y < landmarks[0].y;

        const extendedCount = fingersExtended.filter(Boolean).length;

        // ✋ Open Palm: all 4 fingers + thumb extended
        if (extendedCount >= 4 && thumbExtended) {
            return { name: 'Open Palm', emoji: '✋', action: 'stop' };
        }

        // 👍 Thumbs Up: thumb extended upward, ALL fingers curled
        // MUST be checked before Fist — both have extendedCount === 0 but thumb differs
        if (thumbExtended && thumbPointingUp && extendedCount === 0 && landmarks[4].y < landmarks[5].y) {
            return { name: 'Thumbs Up', emoji: '👍', action: 'confirm' };
        }

        // 👎 Thumbs Down: thumb extended downward, all fingers curled
        if (thumbExtended && !thumbPointingUp && extendedCount === 0 && landmarks[4].y > landmarks[3].y) {
            return { name: 'Thumbs Down', emoji: '👎', action: 'reject' };
        }

        // ✊ Fist: no fingers extended, thumb tucked
        if (extendedCount === 0 && !thumbExtended) {
            return { name: 'Fist', emoji: '✊', action: 'start' };
        }

        // 🤏 Pinch: thumb tip and index tip very close together, other fingers curled
        const pinchDist = landmarkDist(landmarks[4], landmarks[8]);
        if (pinchDist < 0.06 && !fingersExtended[1] && !fingersExtended[2] && !fingersExtended[3]) {
            return { name: 'Pinch', emoji: '🤏', action: 'zoom' };
        }

        // 👌 OK Sign: thumb tip and index tip touching, other 3 fingers extended
        const okDist = landmarkDist(landmarks[4], landmarks[8]);
        if (okDist < 0.07 && fingersExtended[1] && fingersExtended[2] && fingersExtended[3]) {
            return { name: 'OK Sign', emoji: '👌', action: 'toggle-theme' };
        }

        // ✌️ Peace/Victory: index and middle extended, others closed
        if (fingersExtended[0] && fingersExtended[1] && !fingersExtended[2] && !fingersExtended[3]) {
            return { name: 'Peace Sign', emoji: '✌️', action: 'scroll' };
        }

        // ☝️ Pointing: only index extended
        if (fingersExtended[0] && !fingersExtended[1] && !fingersExtended[2] && !fingersExtended[3]) {
            return { name: 'Pointing', emoji: '☝️', action: 'point' };
        }

        // 🤟 Three Fingers: index, middle, ring extended, pinky closed (Scroll Up)
        if (fingersExtended[0] && fingersExtended[1] && fingersExtended[2] && !fingersExtended[3]) {
            return { name: 'Three Fingers', emoji: '🤟', action: 'scroll-up' };
        }

        // ☝️ L-Shape (Thumb and Index extended): Previous Section
        if (thumbExtended && fingersExtended[0] && !fingersExtended[1] && !fingersExtended[2] && !fingersExtended[3]) {
            return { name: 'L-Shape', emoji: '👆', action: 'prev-section' };
        }

        // 🖖 Four Fingers: all 4 fingers extended, thumb tucked (Next Section)
        if (extendedCount >= 4 && !thumbExtended) {
            return { name: 'Four Fingers', emoji: '🖖', action: 'next-section' };
        }

        // 🤘 Rock/Horns: index and pinky extended, middle and ring closed (Go to Top)
        if (fingersExtended[0] && !fingersExtended[1] && !fingersExtended[2] && fingersExtended[3]) {
            return { name: 'Rock On', emoji: '🤘', action: 'top' };
        }

        // 🤙 Hang Loose/Shaka: thumb and pinky extended, others closed (Go to Bottom)
        if (thumbExtended && !fingersExtended[0] && !fingersExtended[1] && !fingersExtended[2] && fingersExtended[3]) {
            return { name: 'Hang Loose', emoji: '🤙', action: 'bottom' };
        }

        return { name: 'Unknown', emoji: '🤚', action: null };
    }

    // Track current section index for next-section gesture
    let currentSectionIndex = 0;
    const allSections = document.querySelectorAll('section[id]');

    // Execute gesture action (with debounce)
    function executeGestureAction(gesture) {
        const now = Date.now();
        if (gesture.name === lastGesture && now - gestureDebounce < 800) return;
        lastGesture = gesture.name;
        gestureDebounce = now;

        gestureEmoji.textContent = gesture.emoji;
        gestureLabel.textContent = gesture.name;
        gestureIndicator.classList.add('active');
        setTimeout(() => gestureIndicator.classList.remove('active'), 1000);

        switch (gesture.action) {
            case 'stop':
                gestureStatus.textContent = '✋ Stop/Pause detected!';
                stopAudioFeatures(); // Universal stop
                break;
            case 'start':
                // Context-aware start
                gestureStatus.textContent = `✊ Start detected for ${activeSectionId}`;
                switch (activeSectionId) {
                    case 'speech-to-text':
                        if (!sttListening) startSTT();
                        break;
                    case 'text-to-speech':
                        const speakBtn = document.getElementById('ttsSpeakBtn');
                        if (speakBtn) speakBtn.click();
                        break;
                    case 'voice-nav':
                        if (!voiceNavActive) document.getElementById('voiceNavBtn').click();
                        break;
                    case 'auto-caption':
                        if (!captionActive) document.getElementById('captionPlayBtn').click();
                        break;
                    default:
                        gestureStatus.textContent = '✊ Start detected (no active tool for this section)';
                }
                break;
            case 'confirm':
                gestureStatus.textContent = '👍 Confirmed!';
                break;
            case 'reject':
                gestureStatus.textContent = '👎 Rejected / Go back!';
                window.history.back();
                break;
            case 'scroll':
                gestureStatus.textContent = '✌️ Scrolling down...';
                window.scrollBy({ top: 400, behavior: 'smooth' });
                break;
            case 'scroll-up':
                gestureStatus.textContent = '🤟 Scrolling up...';
                window.scrollBy({ top: -400, behavior: 'smooth' });
                break;
            case 'top':
                gestureStatus.textContent = '🤘 Going to top...';
                window.scrollTo({ top: 0, behavior: 'smooth' });
                break;
            case 'bottom':
                gestureStatus.textContent = '🤙 Going to bottom...';
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                break;
            case 'point':
                gestureStatus.textContent = '☝️ Pointing detected!';
                break;
            case 'zoom':
                gestureStatus.textContent = '🤏 Pinch — Zoom / Focus!';
                break;
            case 'next-section':
                currentSectionIndex = (currentSectionIndex + 1) % allSections.length;
                const nextSection = allSections[currentSectionIndex];
                if (nextSection) {
                    nextSection.scrollIntoView({ behavior: 'smooth' });
                    gestureStatus.textContent = `🖖 Next section: ${nextSection.id}`;
                }
                break;
            case 'prev-section':
                currentSectionIndex = (currentSectionIndex - 1 + allSections.length) % allSections.length;
                const prevSection = allSections[currentSectionIndex];
                if (prevSection) {
                    prevSection.scrollIntoView({ behavior: 'smooth' });
                    gestureStatus.textContent = `👆 Previous section: ${prevSection.id}`;
                }
                break;
            case 'toggle-theme':
                gestureStatus.textContent = '👌 Toggling theme...';
                const current = document.documentElement.getAttribute('data-theme');
                const next = current === 'dark' ? 'light' : current === 'light' ? 'high-contrast' : 'dark';
                document.documentElement.setAttribute('data-theme', next);
                localStorage.setItem('adapted-theme', next);
                themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === next));
                break;
        }

        trackEvent('gesture_recognition', 'gesture_detected', { gesture: gesture.name });
    }

    async function startGestureRecognition() {
        if (typeof Hands === 'undefined') {
            gestureStatus.textContent = 'MediaPipe Hands not loaded. Please check your internet connection.';
            return;
        }

        stopCameraFeatures('gesture'); // Stop eye tracking camera if running

        try {
            gestureStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
            });
            gestureVideo.srcObject = gestureStream;

            gestureStatus.textContent = '⏳ Loading hand detection model...';

            const hands = new Hands({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
            });

            hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 0, // Lite model — much faster on low-end hardware
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.4
            });

            // Frame-skip counter — process every 2nd frame to halve GPU load
            let gestureFrameCount = 0;

            hands.onResults((results) => {
                const canvasCtx = gestureCanvas.getContext('2d');
                gestureCanvas.width = gestureVideo.videoWidth || 640;
                gestureCanvas.height = gestureVideo.videoHeight || 480;
                canvasCtx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);

                if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                    const landmarks = results.multiHandLandmarks[0];

                    // Draw hand skeleton
                    drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
                        color: '#00b894', lineWidth: 3
                    });
                    drawLandmarks(canvasCtx, landmarks, {
                        color: '#00cec9', lineWidth: 1, radius: 4
                    });

                    // Classify and smooth gesture
                    const rawGesture = classifyGesture(landmarks);
                    if (rawGesture.action) {
                        const confirmed = getSmoothedGesture(rawGesture);
                        if (confirmed) {
                            executeGestureAction(confirmed);
                        }
                        gestureEmoji.textContent = rawGesture.emoji;
                        gestureLabel.textContent = rawGesture.name;
                    } else {
                        gestureBuffer = [];
                        confirmedGesture = null;
                        gestureEmoji.textContent = '🤚';
                        gestureLabel.textContent = 'Show a gesture';
                    }
                } else {
                    gestureBuffer = [];
                    confirmedGesture = null;
                    gestureEmoji.textContent = '🖐️';
                    gestureLabel.textContent = 'No hand detected';
                }
            });

            gestureCamera = new Camera(gestureVideo, {
                onFrame: async () => {
                    // Process every 2nd frame — halves GPU/CPU load
                    gestureFrameCount++;
                    if (gestureFrameCount % 2 !== 0) return;
                    await hands.send({ image: gestureVideo });
                },
                width: 640,
                height: 480
            });

            await gestureCamera.start();
            gestureStatus.textContent = '✅ Camera active — show your hand gestures!';
            gestureStartBtn.style.display = 'none';
            gestureStopBtn.style.display = 'inline-flex';
            trackEvent('gesture_recognition', 'gesture_started');

        } catch (err) {
            console.error('Gesture recognition error:', err);
            if (err.name === 'NotAllowedError') {
                alert('❌ Camera Access Denied.\nPlease allow camera permission in your address bar.');
            } else if (err.name === 'NotFoundError') {
                alert('❌ No Camera Found.\nPlease ensure your camera is connected.');
            } else if (err.name === 'NotReadableError') {
                alert('❌ Camera In Use.\nAnother application might be using your camera.');
            } else {
                alert('❌ Camera Error: ' + err.message);
            }
            gestureStatus.textContent = 'Camera access failed.';
        }
    }

    function stopGestureRecognition() {
        if (gestureCamera) {
            gestureCamera.stop();
            gestureCamera = null;
        }
        if (gestureStream) {
            gestureStream.getTracks().forEach(t => t.stop());
            gestureStream = null;
        }
        gestureVideo.srcObject = null;
        const ctx = gestureCanvas.getContext('2d');
        ctx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);
        gestureEmoji.textContent = '🖐️';
        gestureLabel.textContent = 'No gesture';
        gestureStatus.textContent = 'Click "Start Camera" to begin gesture detection';
        gestureStartBtn.style.display = 'inline-flex';
        gestureStopBtn.style.display = 'none';
        gestureBuffer = [];
        confirmedGesture = null;
    }

    if (gestureStartBtn) {
        gestureStartBtn.addEventListener('click', startGestureRecognition);
    }
    if (gestureStopBtn) {
        gestureStopBtn.addEventListener('click', stopGestureRecognition);
    }

    // ===== 13. SMOOTH SCROLL FOR NAV LINKS =====
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // NOTE: Active nav link tracking is now merged into the main scroll handler above (section 1)

    // ===== 14. INITIALIZE — Load from backend =====
    loadPreferences();
    loadTranscriptionHistory();
    checkAIStatus();
    trackEvent('page', 'page_loaded');

    // ===== 14b. VISUAL IMPAIRMENT PROFILE — Auto voice input =====
    const userProfile = localStorage.getItem('user_disability_profile');
    if (userProfile === 'visual') {
        // 1. Auto-apply visual accessibility settings
        document.documentElement.setAttribute('data-theme', 'high-contrast');
        document.documentElement.setAttribute('data-fontsize', 'large');

        // 2. Auto-start Voice Navigation after a short delay (let page settle)
        setTimeout(() => {
            if (voiceNavBtn && !voiceNavActive) {
                voiceNavBtn.click(); // Activates voice nav
            }
        }, 1500);

        // 3. Welcome announcement via TTS
        setTimeout(() => {
            const welcome = new SpeechSynthesisUtterance(
                'Welcome to AdaptEd. Voice navigation is now active. ' +
                'Say "help" to hear all available voice commands. ' +
                'Press Alt plus V to toggle voice control at any time. ' +
                'All text fields now have a microphone button for voice input.'
            );
            welcome.rate = 1.0;
            welcome.volume = 1.0;
            speechSynthesis.speak(welcome);
        }, 2500);

        // 4. Add voice-input mic buttons next to every text input field
        const textInputs = document.querySelectorAll('textarea, input[type="text"]');
        textInputs.forEach((input) => {
            // Skip if already has a mic button
            if (input.parentElement.querySelector('.voice-input-btn')) return;

            const micBtn = document.createElement('button');
            micBtn.className = 'voice-input-btn';
            micBtn.type = 'button';
            micBtn.innerHTML = '<i class="fas fa-microphone"></i> Speak';
            micBtn.setAttribute('aria-label', `Voice input for ${input.placeholder || input.id || 'text field'}`);
            micBtn.style.cssText = `
                display: inline-flex; align-items: center; gap: 6px;
                margin: 8px 0; padding: 8px 16px;
                background: var(--color-voice, #fdcb6e); color: #000;
                border: none; border-radius: 8px; cursor: pointer;
                font-size: 0.85rem; font-weight: 600;
                transition: all 0.2s ease;
            `;

            let dictationRecognition = null;
            let isDictating = false;

            micBtn.addEventListener('click', () => {
                if (isDictating) {
                    // Stop dictation
                    isDictating = false;
                    if (dictationRecognition) dictationRecognition.stop();
                    micBtn.innerHTML = '<i class="fas fa-microphone"></i> Speak';
                    micBtn.style.background = 'var(--color-voice, #fdcb6e)';
                    return;
                }

                // Stop voice nav temporarily so mic doesn't conflict
                if (voiceNavActive) {
                    voiceNavActive = false;
                    voiceNavRecognition.stop();
                    voiceNavBtn.classList.remove('active');
                }
                stopAudioFeatures('dictation');

                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (!SpeechRecognition) {
                    const noSupport = new SpeechSynthesisUtterance('Speech recognition is not supported in this browser.');
                    speechSynthesis.speak(noSupport);
                    return;
                }

                dictationRecognition = new SpeechRecognition();
                dictationRecognition.continuous = true;
                dictationRecognition.interimResults = true;
                dictationRecognition.lang = 'en-US';

                isDictating = true;
                micBtn.innerHTML = '<i class="fas fa-stop-circle"></i> Stop';
                micBtn.style.background = '#e74c3c';
                micBtn.style.color = '#fff';

                // Announce
                const announce = new SpeechSynthesisUtterance('Speak now. Your words will appear in the text field.');
                announce.rate = 1.2;
                speechSynthesis.speak(announce);

                dictationRecognition.onresult = (event) => {
                    let finalTranscript = '';
                    let interimTranscript = '';
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        if (event.results[i].isFinal) {
                            finalTranscript += event.results[i][0].transcript;
                        } else {
                            interimTranscript += event.results[i][0].transcript;
                        }
                    }
                    if (finalTranscript) {
                        // Append to existing input value
                        input.value += (input.value ? ' ' : '') + finalTranscript.trim();
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                };

                dictationRecognition.onend = () => {
                    if (isDictating) {
                        // Auto-restart if still in dictation mode
                        try { dictationRecognition.start(); } catch (e) { /* ignore */ }
                    } else {
                        micBtn.innerHTML = '<i class="fas fa-microphone"></i> Speak';
                        micBtn.style.background = 'var(--color-voice, #fdcb6e)';
                        micBtn.style.color = '#000';
                    }
                };

                dictationRecognition.onerror = (event) => {
                    if (event.error !== 'no-speech' && event.error !== 'aborted') {
                        const errMsg = new SpeechSynthesisUtterance('Microphone error. Please check permissions.');
                        speechSynthesis.speak(errMsg);
                        isDictating = false;
                        micBtn.innerHTML = '<i class="fas fa-microphone"></i> Speak';
                        micBtn.style.background = 'var(--color-voice, #fdcb6e)';
                        micBtn.style.color = '#000';
                    }
                };

                dictationRecognition.start();
            });

            // Insert mic button after the input
            input.parentElement.insertBefore(micBtn, input.nextSibling);
        });
    }

    // Debug Permissions
    const debugBtn = document.getElementById('debugPerms');
    if (debugBtn) {
        debugBtn.addEventListener('click', async () => {
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
                alert('✅ Permissions Working! Audio & Video access granted.');
            } catch (e) {
                alert('❌ Permission Error: ' + e.name + ' - ' + e.message);
            }
        });
    }

    // ===== 15. CLEANUP ON PAGE UNLOAD — Prevent memory leaks =====
    window.addEventListener('beforeunload', () => {
        // Stop all speech recognition instances
        if (sttRecognition) try { sttRecognition.stop(); } catch (e) { /* ignore */ }
        if (voiceNavRecognition) try { voiceNavRecognition.stop(); } catch (e) { /* ignore */ }
        if (captionRecognition) try { captionRecognition.stop(); } catch (e) { /* ignore */ }
        // Stop speech synthesis
        if (speechSynthesis.speaking) speechSynthesis.cancel();
        // Stop camera streams
        if (gestureStream) gestureStream.getTracks().forEach(t => t.stop());
        if (gestureCamera) try { gestureCamera.stop(); } catch (e) { /* ignore */ }
        // Stop WebGazer
        if (window.webgazer && eyeTrackingActive) try { webgazer.end(); } catch (e) { /* ignore */ }
        // Disconnect IntersectionObserver
        if (revealObserver) revealObserver.disconnect();
    });

});
