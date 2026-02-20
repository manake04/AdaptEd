// ===== Gesture Module — MediaPipe Hands =====
// Detects hand gestures via webcam: open_palm (Next), fist (Pause), two_fingers (Repeat)

const GestureModule = {
    hands: null,
    camera: null,
    isDetecting: false,
    onGestureCallback: null,
    lastGesture: null,
    lastGestureTime: 0,
    DEBOUNCE_MS: 1200, // Prevent rapid-fire gesture triggers

    // ===== Initialize =====
    async init(videoElement, canvasElement, onGesture) {
        if (!videoElement) {
            console.warn('[Gesture] No video element provided');
            return false;
        }
        this.onGestureCallback = onGesture;

        // Check if MediaPipe Hands is loaded
        if (typeof Hands === 'undefined') {
            console.error('[Gesture] MediaPipe Hands library not loaded');
            return false;
        }

        try {
            this.hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });

            this.hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 1,
                minDetectionConfidence: 0.6,
                minTrackingConfidence: 0.5
            });

            this.hands.onResults((results) => this.onResults(results, canvasElement));

            this.camera = new Camera(videoElement, {
                onFrame: async () => {
                    if (this.isDetecting && this.hands) {
                        try {
                            await this.hands.send({ image: videoElement });
                        } catch (e) {
                            // Silently handle frame errors
                        }
                    }
                },
                width: 640,
                height: 480
            });

            console.log('[Gesture] Initialized successfully');
            return true;
        } catch (error) {
            console.error('[Gesture] Init error:', error);
            return false;
        }
    },

    // ===== Start Detection =====
    startDetection() {
        if (this.camera) {
            this.camera.start();
            this.isDetecting = true;
            console.log('[Gesture] Detection started');

            // Hide webcam overlay
            const overlay = document.getElementById('webcamOverlay');
            if (overlay) overlay.classList.add('hidden');

            return true;
        }
        return false;
    },

    // ===== Stop Detection =====
    stopDetection() {
        this.isDetecting = false;
        if (this.camera) {
            this.camera.stop();
        }
        console.log('[Gesture] Detection stopped');

        // Show webcam overlay
        const overlay = document.getElementById('webcamOverlay');
        if (overlay) overlay.classList.remove('hidden');
    },

    // ===== Process Results =====
    onResults(results, canvasElement) {
        // Draw hand landmarks on canvas overlay
        if (canvasElement) {
            const ctx = canvasElement.getContext('2d');
            ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                for (const landmarks of results.multiHandLandmarks) {
                    // Draw connections
                    if (typeof drawConnectors !== 'undefined') {
                        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
                            color: '#6366f1', lineWidth: 2
                        });
                    }
                    // Draw landmarks
                    if (typeof drawLandmarks !== 'undefined') {
                        drawLandmarks(ctx, landmarks, {
                            color: '#22c55e', lineWidth: 1, radius: 3
                        });
                    }

                    // Classify gesture
                    const gesture = this.classifyGesture(landmarks);
                    if (gesture) {
                        this.handleGesture(gesture);
                    }
                }
            }
        }
    },

    // ===== Classify Gesture =====
    classifyGesture(landmarks) {
        // Get fingertip and PIP (proximal interphalangeal) joint positions
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];

        const indexPip = landmarks[6];
        const middlePip = landmarks[10];
        const ringPip = landmarks[14];
        const pinkyPip = landmarks[18];

        // Finger "up" = tip is above (lower Y) than PIP joint
        const isUp = (tip, pip) => tip.y < pip.y;

        const indexUp = isUp(indexTip, indexPip);
        const middleUp = isUp(middleTip, middlePip);
        const ringUp = isUp(ringTip, ringPip);
        const pinkyUp = isUp(pinkyTip, pinkyPip);

        // Open Palm: all 4 fingers extended → NEXT
        if (indexUp && middleUp && ringUp && pinkyUp) {
            return 'open_palm';
        }
        // Fist: no fingers extended → PAUSE
        if (!indexUp && !middleUp && !ringUp && !pinkyUp) {
            return 'fist';
        }
        // Two Fingers (peace sign): index + middle up, ring + pinky down → REPEAT
        if (indexUp && middleUp && !ringUp && !pinkyUp) {
            return 'two_fingers';
        }

        return null;
    },

    // ===== Handle Gesture with Debounce =====
    handleGesture(gesture) {
        const now = Date.now();
        // Debounce: only fire if different gesture or enough time passed
        if (gesture === this.lastGesture && (now - this.lastGestureTime) < this.DEBOUNCE_MS) {
            return;
        }

        this.lastGesture = gesture;
        this.lastGestureTime = now;

        // Map gesture to action
        const GESTURE_MAP = {
            'open_palm': { action: 'next', label: 'Open Palm → Next' },
            'fist': { action: 'pause', label: 'Fist → Pause' },
            'two_fingers': { action: 'repeat', label: 'Two Fingers → Repeat' }
        };

        const mapped = GESTURE_MAP[gesture];
        if (mapped && this.onGestureCallback) {
            this.onGestureCallback(mapped.action, mapped.label, gesture);
        }

        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('gesture-command', {
            detail: { gesture, action: mapped?.action, label: mapped?.label }
        }));

        // Highlight gesture guide item
        this.highlightGestureItem(gesture);

        console.log(`[Gesture] Detected: ${mapped?.label || gesture}`);
    },

    // ===== Visual Feedback — Highlight active gesture in guide =====
    highlightGestureItem(gesture) {
        const items = {
            'open_palm': 'gestureNext',
            'fist': 'gesturePause',
            'two_fingers': 'gestureRepeat'
        };

        // Remove all active states
        Object.values(items).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('active');
                const dot = el.querySelector('.dot');
                if (dot) { dot.classList.remove('on'); dot.classList.add('off'); }
            }
        });

        // Activate the detected gesture
        const activeId = items[gesture];
        if (activeId) {
            const el = document.getElementById(activeId);
            if (el) {
                el.classList.add('active');
                const dot = el.querySelector('.dot');
                if (dot) { dot.classList.remove('off'); dot.classList.add('on'); }

                // Auto-remove after debounce period
                setTimeout(() => {
                    el.classList.remove('active');
                    if (dot) { dot.classList.remove('on'); dot.classList.add('off'); }
                }, this.DEBOUNCE_MS);
            }
        }
    }
};

// Expose globally
window.GestureModule = GestureModule;
