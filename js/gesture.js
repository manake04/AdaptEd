// Gesture Module - MediaPipe Hands
export const GestureModule = {
    hands: null,
    camera: null,
    isDetecting: false,
    onGesture: null, // Callback for recognized gesture

    async init(videoElement, onGestureCallback) {
        if (!videoElement) return;
        this.onGesture = onGestureCallback;

        // Import MediaPipe Hands (Assuming CDN script loaded in HTML)
        const { Hands, Camera } = window;

        if (!Hands) {
            console.error('MediaPipe Hands not loaded.');
            return;
        }

        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.hands.onResults(this.onResults.bind(this));

        this.camera = new Camera(videoElement, {
            onFrame: async () => {
                try {
                    if (this.isDetecting) await this.hands.send({ image: videoElement });
                } catch (e) {
                    console.error('Gesture camera error:', e);
                }
            },
            width: 640,
            height: 480
        });
    },

    startDetection() {
        if (this.camera) {
            this.camera.start();
            this.isDetecting = true;
        }
    },

    stopDetection() {
        this.isDetecting = false;
        // Optimization: Don't fully stop camera if used by other modules (like eye tracking)
        // unless explicitly requested to free resources
    },

    onResults(results) {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const gesture = this.classifyGesture(landmarks);
            if (gesture && this.onGesture) {
                this.onGesture(gesture);
            }
        }
    },

    classifyGesture(landmarks) {
        // Simple logic:
        // Open Palm: Fingers extended
        // Fist: Fingers curled
        // Two Fingers: Index & Middle extended

        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];

        // Simplified check (Y-coordinate based, assumes hand is upright)
        // Ideally needs more robust vector math, but this fits the "simple demo" requirement

        const isFingerUp = (tip, base) => tip.y < base.y;

        // Approx. bases (using PIP joints)
        const indexPip = landmarks[6];
        const middlePip = landmarks[10];
        const ringPip = landmarks[14];
        const pinkyPip = landmarks[18];

        const indexUp = isFingerUp(indexTip, indexPip);
        const middleUp = isFingerUp(middleTip, middlePip);
        const ringUp = isFingerUp(ringTip, ringPip);
        const pinkyUp = isFingerUp(pinkyTip, pinkyPip);

        if (indexUp && middleUp && ringUp && pinkyUp) {
            return 'open_palm'; // Next
        } else if (!indexUp && !middleUp && !ringUp && !pinkyUp) {
            return 'fist'; // Pause
        } else if (indexUp && middleUp && !ringUp && !pinkyUp) {
            return 'two_fingers'; // Repeat
        }

        return null;
    }
};
