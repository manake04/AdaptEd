// Adaptive Accessibility Engine
// Manages profiles and feature orchestration

import { SpeechModule } from './speech.js';
import { GestureModule } from './gesture.js';

export const AccessibilityEngine = {
    currentProfile: 'normal',
    features: {
        tts: false,
        stt: false,
        captions: false,
        gestures: false,
        eyeTracking: false,
        highContrast: false,
        largeText: false,
        summarizer: false // auto-summarize
    },

    init() {
        console.log('Accessibility Engine Initialized');
        this.loadProfile();
        this.renderProfileSelector();
    },

    setProfile(profileName) {
        this.currentProfile = profileName;
        this.applyProfileLogic(profileName);
        this.saveProfile(profileName);
        this.updateUI();
    },

    applyProfileLogic(profile) {
        // Reset all features first
        Object.keys(this.features).forEach(k => this.features[k] = false);

        switch (profile) {
            case 'hearing':
                this.features.captions = true;
                this.features.summarizer = true;
                this.features.stt = true; // For input
                break;
            case 'visual':
                this.features.tts = true;
                this.features.stt = true; // Voice command
                this.features.highContrast = true;
                this.features.largeText = true;
                break;
            case 'motor':
                this.features.gestures = true;
                this.features.eyeTracking = true;
                this.features.stt = true; // Voice command critical
                this.features.largeText = true; // Easier targets
                break;
            case 'normal':
            default:
                // Standard features available on demand, but not auto-enforced
                break;
        }

        console.log(`Profile Applied: ${profile}`, this.features);
        this.activateFeatures();
    },

    activateFeatures() {
        // 1. Visual Adjustments
        document.body.classList.toggle('high-contrast', this.features.highContrast);
        document.documentElement.setAttribute('data-fontsize', this.features.largeText ? 'large' : 'normal');

        // 2. Voice / Speech
        if (this.features.stt) {
            SpeechModule.startListening(
                (final, interim) => {
                    console.log('Voice Input:', final);
                    this.handleVoiceCommand(final);
                },
                () => console.log('Listening stopped')
            );
        } else {
            SpeechModule.stopListening();
        }

        // 3. Gestures
        if (this.features.gestures) {
            // Assume video element exists with ID 'inputVideo'
            const videoEl = document.getElementById('inputVideo');
            if (videoEl) {
                GestureModule.init(videoEl, (gesture) => this.handleGestureCommand(gesture));
                GestureModule.startDetection();
            }
        }
    },

    handleVoiceCommand(command) {
        const cmd = command.toLowerCase();
        if (cmd.includes('scroll down')) window.scrollBy(0, 500);
        if (cmd.includes('scroll up')) window.scrollBy(0, -500);
        if (cmd.includes('stop')) this.stopAll();
        // Dispatch event for other modules
        window.dispatchEvent(new CustomEvent('voice-command', { detail: cmd }));
    },

    handleGestureCommand(gesture) {
        console.log('Gesture Detected:', gesture);
        if (gesture === 'fist') {
            // Pause media / Stop scrolling
        } else if (gesture === 'open_palm') {
            // Next / Scroll Down
            window.scrollBy(0, 300);
        }
    },

    stopAll() {
        SpeechModule.stopListening();
        SpeechModule.stopSpeaking();
    },

    saveProfile(profile) {
        localStorage.setItem('user_disability_profile', profile);
        // Optional Backend Sync
        // fetch('/api/profile/save', { ... })
    },

    loadProfile() {
        const saved = localStorage.getItem('user_disability_profile');
        if (saved) {
            this.setProfile(saved);
        } else {
            // First time logic handled by UI selector
        }
    },

    renderProfileSelector() {
        // Logic to show modal if no profile selected
        if (!localStorage.getItem('user_disability_profile')) {
            const modal = document.getElementById('profileModal');
            if (modal) modal.style.display = 'flex';
        }
    }
};
