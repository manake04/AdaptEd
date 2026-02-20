// ===== Adaptive Accessibility Engine =====
// Core module: manages profiles and auto-activates features

const AccessibilityEngine = {
    currentProfile: 'normal',

    // Feature flags — toggled by profile selection
    features: {
        tts: false,       // Text-to-speech
        stt: false,       // Speech-to-text / voice commands
        captions: false,  // Live captions display
        gestures: false,  // Hand gesture navigation
        highContrast: false,
        largeText: false
    },

    // ===== Initialize =====
    init() {
        console.log('[Engine] Accessibility Engine initialized');
        const saved = localStorage.getItem('adapted_profile');
        if (saved) {
            this.setProfile(saved, true); // silent = true, don't re-show modal
        } else {
            this.showProfileModal();
        }
    },

    // ===== Set Profile =====
    setProfile(profileName, silent = false) {
        this.currentProfile = profileName;
        this.applyProfileLogic(profileName);
        this.saveToStorage(profileName);
        this.updateDashboard();
        this.updateProfileBadge();
        if (!silent) this.hideProfileModal();

        console.log(`[Engine] Profile set: ${profileName}`, this.features);

        // Dispatch event for other modules to react
        window.dispatchEvent(new CustomEvent('profile-changed', {
            detail: { profile: profileName, features: { ...this.features } }
        }));
    },

    // ===== Profile → Feature Mapping =====
    applyProfileLogic(profile) {
        // Reset all
        Object.keys(this.features).forEach(k => this.features[k] = false);

        switch (profile) {
            case 'hearing':
                // Hearing Impaired: captions ON, TTS OFF
                this.features.captions = true;
                this.features.stt = true; // For text input via voice
                // TTS stays OFF — user cannot hear
                break;

            case 'visual':
                // Visually Impaired: TTS ON, voice nav ON, high contrast ON
                this.features.tts = true;
                this.features.stt = true;
                this.features.highContrast = true;
                this.features.largeText = true;
                break;

            case 'motor':
                // Motor Impaired: gestures ON, voice ON, large targets
                this.features.gestures = true;
                this.features.stt = true;
                this.features.largeText = true;
                break;

            case 'normal':
            default:
                // Normal: all features available on-demand, nothing auto-enforced
                break;
        }

        this.applyUIAdaptations();
    },

    // ===== Apply CSS-level UI Changes =====
    applyUIAdaptations() {
        const body = document.body;

        // High Contrast
        body.classList.toggle('high-contrast', this.features.highContrast);
        const contrastToggle = document.getElementById('toggleContrast');
        if (contrastToggle) contrastToggle.checked = this.features.highContrast;

        // Large Text
        document.documentElement.setAttribute('data-fontsize', this.features.largeText ? 'large' : 'normal');
        const textToggle = document.getElementById('toggleLargeText');
        if (textToggle) textToggle.checked = this.features.largeText;

        // Motor mode (extra large buttons)
        body.classList.toggle('motor-mode', this.currentProfile === 'motor');

        // Captions panel visibility
        const captionsPanel = document.getElementById('captionsPanel');
        if (captionsPanel) {
            captionsPanel.style.display = this.features.captions ? 'block' : 'none';
        }
    },

    // ===== Update Status Bar Chips =====
    updateDashboard() {
        const mapping = {
            captions: 'dashCaptions',
            tts: 'dashTTS',
            stt: 'dashSTT',
            gestures: 'dashGestures',
            highContrast: 'dashContrast'
        };

        for (const [feature, chipId] of Object.entries(mapping)) {
            const chip = document.getElementById(chipId);
            if (!chip) continue;

            const isActive = this.features[feature];
            chip.classList.toggle('active', isActive);

            // Update the dot inside the chip
            const dot = chip.querySelector('.dot');
            if (dot) {
                dot.classList.toggle('on', isActive);
                dot.classList.toggle('off', !isActive);
            }
        }
    },

    // ===== Update Profile Badge in Navbar =====
    updateProfileBadge() {
        const badge = document.getElementById('profileBadge');
        const label = document.getElementById('profileBadgeLabel');
        const icon = badge?.querySelector('.badge-icon');
        if (!label) return;

        const PROFILES = {
            hearing: { label: 'Hearing', icon: '🦻' },
            visual: { label: 'Visual', icon: '👁️' },
            motor: { label: 'Motor', icon: '🖐️' },
            normal: { label: 'Normal', icon: '🎓' }
        };

        const p = PROFILES[this.currentProfile] || PROFILES.normal;
        label.textContent = p.label;
        if (icon) icon.textContent = p.icon;
    },

    // ===== Modal Controls =====
    showProfileModal() {
        const modal = document.getElementById('profileModal');
        if (modal) modal.style.display = 'flex';
    },

    hideProfileModal() {
        const modal = document.getElementById('profileModal');
        if (modal) modal.style.display = 'none';
    },

    // ===== Persistence =====
    saveToStorage(profile) {
        localStorage.setItem('adapted_profile', profile);
        // Optional: sync to backend
        fetch('/api/profile/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: this.getUserId(), profile, settings: this.features })
        }).catch(() => { }); // Silent fail for offline
    },

    getUserId() {
        let id = localStorage.getItem('adapted_user_id');
        if (!id) {
            id = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            localStorage.setItem('adapted_user_id', id);
        }
        return id;
    },

    // ===== Manual Feature Toggles =====
    toggleFeature(featureName, forceValue) {
        if (featureName in this.features) {
            this.features[featureName] = forceValue !== undefined ? forceValue : !this.features[featureName];
            this.applyUIAdaptations();
            this.updateDashboard();
            window.dispatchEvent(new CustomEvent('feature-toggled', {
                detail: { feature: featureName, active: this.features[featureName] }
            }));
        }
    },

    // ===== Check if a feature is active =====
    isActive(featureName) {
        return this.features[featureName] === true;
    }
};

// Expose globally
window.AccessibilityEngine = AccessibilityEngine;
