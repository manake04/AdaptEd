// ===== Speech Module — STT & TTS =====
// Web Speech API integration with voice command recognition

const SpeechModule = {
    recognition: null,
    synthesis: window.speechSynthesis,
    isListening: false,
    voices: [],
    onCommandCallback: null,
    onTranscriptCallback: null,

    // ===== Initialize =====
    init() {
        // Speech Recognition (STT)
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';
            console.log('[Speech] Speech Recognition initialized');
        } else {
            console.warn('[Speech] Speech Recognition API not supported in this browser');
        }

        // Load TTS voices
        this.loadVoices();
        if (this.synthesis.onvoiceschanged !== undefined) {
            this.synthesis.onvoiceschanged = () => this.loadVoices();
        }
    },

    loadVoices() {
        this.voices = this.synthesis.getVoices();
    },

    // ===== Start Listening for Voice Input =====
    startListening(onTranscript, onCommand) {
        if (!this.recognition) {
            console.warn('[Speech] Recognition not available');
            return false;
        }
        if (this.isListening) return true;

        this.onTranscriptCallback = onTranscript;
        this.onCommandCallback = onCommand;

        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // Send transcript to callback
            if (this.onTranscriptCallback) {
                this.onTranscriptCallback(finalTranscript, interimTranscript);
            }

            // Check for voice commands on final transcript
            if (finalTranscript && this.onCommandCallback) {
                const command = this.matchCommand(finalTranscript);
                if (command) {
                    this.onCommandCallback(command, finalTranscript);
                }
            }
        };

        this.recognition.onerror = (event) => {
            console.warn('[Speech] Recognition error:', event.error);
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                this.isListening = false;
            }
        };

        this.recognition.onend = () => {
            // Auto-restart if still supposed to be listening
            if (this.isListening) {
                try { this.recognition.start(); } catch (e) { /* ignore */ }
            }
        };

        try {
            this.recognition.start();
            this.isListening = true;
            console.log('[Speech] Listening started');
            return true;
        } catch (e) {
            console.error('[Speech] Failed to start:', e);
            return false;
        }
    },

    // ===== Stop Listening =====
    stopListening() {
        if (this.recognition && this.isListening) {
            this.isListening = false;
            try { this.recognition.stop(); } catch (e) { /* ignore */ }
            console.log('[Speech] Listening stopped');
        }
    },

    // ===== Voice Command Matching =====
    // Keyword-based command recognition
    matchCommand(transcript) {
        const text = transcript.toLowerCase().trim();

        // Command keywords → action mapping
        const COMMANDS = [
            { keywords: ['summarize', 'summary', 'sum up'], action: 'summarize' },
            { keywords: ['read', 'read aloud', 'speak', 'read out'], action: 'read' },
            { keywords: ['next', 'go next', 'forward'], action: 'next' },
            { keywords: ['stop', 'pause', 'halt', 'cancel'], action: 'stop' },
            { keywords: ['repeat', 'again', 'say again'], action: 'repeat' },
            { keywords: ['scroll down', 'go down'], action: 'scroll_down' },
            { keywords: ['scroll up', 'go up'], action: 'scroll_up' },
            { keywords: ['contrast', 'high contrast'], action: 'toggle_contrast' },
            { keywords: ['simplify', 'make simple', 'easy'], action: 'simplify' },
            { keywords: ['clear', 'erase'], action: 'clear' }
        ];

        for (const cmd of COMMANDS) {
            for (const keyword of cmd.keywords) {
                if (text.includes(keyword)) {
                    return { action: cmd.action, keyword, transcript: text };
                }
            }
        }
        return null;
    },

    // ===== Text-to-Speech =====
    speak(text, rate = 1, pitch = 1) {
        if (!text) return;
        if (this.synthesis.speaking) this.synthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = rate;
        utterance.pitch = pitch;
        utterance.lang = 'en-US';

        // Pick a good English voice if available
        const englishVoice = this.voices.find(v => v.lang.startsWith('en') && v.localService);
        if (englishVoice) utterance.voice = englishVoice;

        this.synthesis.speak(utterance);
        console.log('[Speech] Speaking:', text.slice(0, 50) + '...');
        return utterance;
    },

    // ===== Stop Speaking =====
    stopSpeaking() {
        if (this.synthesis.speaking) {
            this.synthesis.cancel();
            console.log('[Speech] Speaking stopped');
        }
    },

    // ===== Check if currently speaking =====
    isSpeaking() {
        return this.synthesis.speaking;
    }
};

// Initialize and expose globally
SpeechModule.init();
window.SpeechModule = SpeechModule;
