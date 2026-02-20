// Speech Module (STT & TTS)
export const SpeechModule = {
    recognition: null,
    synthesis: window.speechSynthesis,
    isListening: false,
    voices: [],

    init() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';
        } else {
            console.warn('Speech Recognition API not supported.');
        }

        // Load voices
        this.loadVoices();
        if (this.synthesis.onvoiceschanged !== undefined) {
            this.synthesis.onvoiceschanged = this.loadVoices.bind(this);
        }
    },

    loadVoices() {
        this.voices = this.synthesis.getVoices();
    },

    startListening(onResult, onEnd) {
        if (!this.recognition) return;
        if (this.isListening) return;

        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            onResult(finalTranscript, interimTranscript);
        };

        this.recognition.onend = () => {
            this.isListening = false;
            if (onEnd) onEnd();
        };

        this.recognition.start();
        this.isListening = true;
    },

    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
        }
    },

    speak(text, rate = 1, pitch = 1, voiceIndex = 0) {
        if (this.synthesis.speaking) {
            this.synthesis.cancel();
        }
        if (!text) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = rate;
        utterance.pitch = pitch;
        if (this.voices[voiceIndex]) {
            utterance.voice = this.voices[voiceIndex];
        }

        this.synthesis.speak(utterance);
    },

    stopSpeaking() {
        if (this.synthesis.speaking) {
            this.synthesis.cancel();
        }
    }
};

SpeechModule.init();
