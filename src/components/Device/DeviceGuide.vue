<template>
    <button class="dd-icon-btn" @click="guideDialogVisible = true" title="Help Documentation">
        <v-icon size="18">mdi-help-circle-outline</v-icon>
    </button>

    <v-dialog v-model="guideDialogVisible" max-width="560">
        <div class="guide-dialog">
            <div class="gd-header">
                <span class="gd-title">Device Setup Guide</span>
                <button class="gd-close" @click="guideDialogVisible = false">
                    <v-icon size="18">mdi-close</v-icon>
                </button>
            </div>

            <div class="gd-body">
                <p class="gd-section-label">Setup Steps</p>
                <ol class="gd-steps">
                    <li v-for="(step, index) in allSteps" :key="index" class="gd-step">
                        <strong>{{ step.title }}</strong>
                        <span>{{ step.content }}</span>
                    </li>
                </ol>

                <details class="gd-faq">
                    <summary class="gd-faq-toggle">Frequently Asked Questions (FAQ)</summary>
                    <div class="gd-faq-list">
                        <div v-for="(item, index) in faqItems" :key="index" class="gd-faq-item">
                            <strong>{{ item.question }}</strong>
                            <p>{{ item.answer }}</p>
                        </div>
                    </div>
                </details>
            </div>

            <div class="gd-actions">
                <v-btn size="small" color="primary" @click="guideDialogVisible = false">
                    Done
                </v-btn>
            </div>
        </div>
    </v-dialog>
</template>

<script setup>
import { computed, ref } from 'vue';

const guideDialogVisible = ref(false);

const developerSteps = [
    { title: 'Open Settings', content: 'Go to your phone\'s Settings app' },
    { title: 'Find "About Phone"', content: 'Scroll to the bottom of Settings and tap "About Phone" or "About Device"' },
    { title: 'Tap "Build Number"', content: 'Tap "Build Number" or "Build Number" 7 times until you see "You are now a developer" message' },
    { title: 'Return to Settings', content: 'Go back to main Settings, you should see new "Developer Options" menu' },
];

const connectionSteps = [
    { title: 'Developer Options', content: 'Go to "Developer Options" menu' },
    { title: 'Enable USB Debugging', content: 'In Developer Options, find and enable "USB Debugging" switch' },
    { title: 'Confirm', content: 'Click "OK" or "Allow" in the popup dialog to enable USB debugging' },
    { title: 'Connect Device', content: 'Connect device to computer using USB cable and allow USB debugging on device' },
];

const allSteps = computed(() => [...developerSteps, ...connectionSteps]);

const faqItems = [
    { question: 'How to enable Developer Options?', answer: 'Go to "Settings" > "About Phone", then tap "Build Number" 7 times.' },
    { question: 'What if device is not recognized?', answer: 'Make sure your device drivers are properly installed and USB debugging mode is enabled. Try reconnecting USB cable or restarting device.' },
    { question: 'What if USB debugging cannot be enabled?', answer: 'Some devices may require additional steps. Please check your device\'s specific instructions or contact device manufacturer for help.' },
    { question: 'What if nothing happens after connecting device?', answer: 'Check if your USB cable supports data transfer. Some USB cables only support charging, not data transfer. Try using a different USB cable or port.' },
];
</script>

<style scoped>
.dd-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    color: rgba(24, 24, 27, 0.5);
    transition: background 0.15s;
}

.dd-icon-btn:hover {
    background: rgba(24, 24, 27, 0.06);
}

.guide-dialog {
    background: rgb(var(--v-theme-surface));
    border-radius: 12px;
    overflow: hidden;
}

.gd-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 0;
}

.gd-title {
    font-size: 15px;
    font-weight: 600;
    color: rgba(24, 24, 27, 0.85);
}

.gd-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: rgba(24, 24, 27, 0.4);
    cursor: pointer;
}

.gd-close:hover {
    background: rgba(24, 24, 27, 0.06);
}

.gd-body {
    padding: 16px 20px;
}

.gd-section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: rgba(24, 24, 27, 0.4);
    letter-spacing: 0.04em;
    margin: 0 0 10px;
}

.gd-steps {
    list-style: decimal;
    padding-left: 20px;
    margin: 0 0 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.gd-step {
    font-size: 13px;
    color: rgba(24, 24, 27, 0.7);
    line-height: 1.5;
}

.gd-step strong {
    color: rgba(24, 24, 27, 0.85);
    font-weight: 600;
    margin-right: 4px;
}

.gd-faq {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
}

.gd-faq-toggle {
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 500;
    color: rgba(24, 24, 27, 0.7);
    cursor: pointer;
    user-select: none;
}

.gd-faq-toggle:hover {
    background: rgba(24, 24, 27, 0.02);
}

.gd-faq-list {
    padding: 0 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.gd-faq-item {
    font-size: 13px;
    line-height: 1.5;
    color: rgba(24, 24, 27, 0.6);
}

.gd-faq-item strong {
    display: block;
    color: rgba(24, 24, 27, 0.8);
    font-weight: 500;
    margin-bottom: 2px;
}

.gd-faq-item p {
    margin: 0;
}

.gd-actions {
    display: flex;
    justify-content: flex-end;
    padding: 12px 20px;
    border-top: 1px solid var(--border);
}
</style>
