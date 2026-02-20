// Accessibility Profile Controller

// In-memory store (or DB in full implementation) for user preferences
const userProfiles = {};

// Save User Profile
exports.saveProfile = async (req, res) => {
    try {
        const { userId, profile, settings } = req.body;

        userProfiles[userId] = {
            profile: profile, // 'hearing', 'visual', 'motor', 'normal'
            settings: settings, // High Contrast, Large Text, etc.
            updatedAt: new Date()
        };

        res.json({ success: true, message: 'Profile saved', profile: userProfiles[userId] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save profile' });
    }
};

// Get User Profile
exports.getProfile = async (req, res) => {
    try {
        const { userId } = req.params;
        const profile = userProfiles[userId] || { profile: 'normal', settings: {} };
        res.json(profile);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve profile' });
    }
};
