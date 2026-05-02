<template>
    <v-card class="device-logcat">
        <v-card-text class="pa-0">
            <div class="header d-flex align-center justify-space-between">
                <div class="d-flex align-center flex-grow-1">
                    <v-select
                        v-model="selectedPriority"
                        :items="priorityOptions"
                        item-title="text"
                        item-value="value"
                        label="Log Level"
                        dense
                        hide-details
                        variant="outlined"
                        density="compact"
                        class="mr-2"
                        style="max-width: 150px"
                    ></v-select>
                    <v-text-field
                        v-model="tagFilter"
                        label="Tag Filter"
                        placeholder="Enter tag to filter"
                        dense
                        hide-details
                        variant="outlined"
                        density="compact"
                        class="mr-2"
                        style="max-width: 150px"
                    ></v-text-field>
                    <v-text-field
                        v-model="searchQuery"
                        label="Search Logs"
                        placeholder="Enter keyword to search"
                        dense
                        hide-details
                        variant="outlined"
                        density="compact"
                        class="flex-grow-1"
                        style="max-width: 450px"
                    ></v-text-field>
                </div>
                <div class="d-flex align-center">
                    <v-btn
                        :color="isRunning ? 'error' : 'primary'"
                        class="mr-2"
                        variant="text"
                        @click="toggleLogcat"
                    >
                        <v-icon>{{ isRunning ? 'mdi-stop' : 'mdi-play' }}</v-icon>
                    </v-btn>
                    <v-btn color="secondary" class="mr-2" variant="text" @click="clearLogs">
                        <v-icon>mdi-delete</v-icon>
                    </v-btn>
                    <v-btn
                        :disabled="filteredLogs.length === 0"
                        color="secondary"
                        variant="text"
                        @click="exportLogs"
                    >
                        <v-icon>mdi-export</v-icon>
                    </v-btn>
                </div>
            </div>

            <div class="log-container">
                <div class="log-header">
                    <div class="log-cell time">Time</div>
                    <div class="log-cell priority">Level</div>
                    <div class="log-cell tag">Tag</div>
                    <div class="log-cell message">Message</div>
                </div>
                <div ref="logContainer" class="log-scroll-area">
                    <v-virtual-scroll
                        :items="filteredLogs"
                        :item-size="28"
                        height="100%"
                        item-height="28"
                    >
                        <template #default="{ item }">
                            <div
                                v-memo="[
                                    item.seconds,
                                    item.nanoseconds,
                                    item.priority,
                                    item.tag,
                                    item.message,
                                ]"
                                :class="[
                                    'log-entry',
                                    `priority-${AndroidLogPriorityToCharacter[item.priority].toLowerCase()}`,
                                ]"
                            >
                                <div class="log-cell time">{{ formatTime(item) }}</div>
                                <div class="log-cell priority">
                                    <v-chip
                                        :color="getPriorityColor(item.priority)"
                                        text-color="white"
                                        size="x-small"
                                        label
                                        class="priority-chip"
                                    >
                                        {{ AndroidLogPriorityToCharacter[item.priority] }}
                                    </v-chip>
                                </div>
                                <div class="log-cell tag">{{ item.tag }}</div>
                                <div class="log-cell message">{{ item.message }}</div>
                            </div>
                        </template>
                    </v-virtual-scroll>
                </div>

                <div v-if="filteredLogs.length === 0" class="no-logs-message">
                    {{ isRunning ? 'Waiting for logs...' : 'No logs available' }}
                </div>
            </div>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
// Script section remains unchanged
import { ref, shallowRef, computed, nextTick, watch } from 'vue';
import client from '../Scrcpy/adb-client';
import {
    Logcat,
    AndroidLogPriority,
    AndroidLogPriorityToCharacter,
    type AndroidLogEntry,
} from '@yume-chan/android-bin';
import type { ReadableStream } from '@yume-chan/stream-extra';

// State variables
const isRunning = ref(false);
const logs = shallowRef<AndroidLogEntry[]>([]);
const selectedPriority = ref<AndroidLogPriority>(AndroidLogPriority.Verbose);
const tagFilter = ref('');
const searchQuery = ref('');
const logContainer = ref<HTMLElement | null>(null);
const isNearBottom = ref(true);

// Logcat instance
let logcat: Logcat | null = null;
let logStream: ReadableStream<AndroidLogEntry> | null = null;
let abortController: AbortController | null = null;
let reader: ReadableStreamDefaultReader<AndroidLogEntry> | null = null;
let shouldStopLogcat = false;

// Log queue and processing related variables
const MAX_LOGS = 5000;
const logQueue: AndroidLogEntry[] = [];
let isProcessingQueue = false;
let lastUpdateTime = 0;
const UPDATE_INTERVAL = 100;

// Priority options
const priorityOptions = [
    { text: 'Verbose (V)', value: AndroidLogPriority.Verbose },
    { text: 'Debug (D)', value: AndroidLogPriority.Debug },
    { text: 'Info (I)', value: AndroidLogPriority.Info },
    { text: 'Warn (W)', value: AndroidLogPriority.Warn },
    { text: 'Error (E)', value: AndroidLogPriority.Error },
    { text: 'Fatal (F)', value: AndroidLogPriority.Fatal },
];

// Priority color mapping
const priorityColors = {
    [AndroidLogPriority.Verbose]: 'grey darken-2',
    [AndroidLogPriority.Debug]: 'blue darken-3',
    [AndroidLogPriority.Info]: 'green darken-3',
    [AndroidLogPriority.Warn]: 'orange darken-3',
    [AndroidLogPriority.Error]: 'red darken-3',
    [AndroidLogPriority.Fatal]: 'purple darken-3',
};

// Use computed property to filter logs
const filteredLogs = computed(() => {
    const priority = selectedPriority.value;
    const tag = tagFilter.value.toLowerCase();
    const query = searchQuery.value.toLowerCase();

    return logs.value.filter((log) => {
        if (log.priority < priority) return false;
        if (tag && !log.tag.toLowerCase().includes(tag)) return false;
        if (query && !log.message.toLowerCase().includes(query)) return false;
        return true;
    });
});

// Watch filter conditions change, reset scroll position when conditions change
watch([selectedPriority, tagFilter, searchQuery], () => {
    nextTick(() => {
        if (logContainer.value) {
            logContainer.value.scrollTop = 0;
        }
    });
});

// Toggle Logcat status
const toggleLogcat = async () => {
    if (isRunning.value) {
        await stopLogcat();
    } else {
        await startLogcat();
    }
};

// Start Logcat
const startLogcat = async () => {
    try {
        logcat = new Logcat(client.device);
        abortController = new AbortController();
        logStream = logcat.binary();

        isRunning.value = true;
        shouldStopLogcat = false;
        logs.value = [];

        reader = logStream.getReader();
        while (!shouldStopLogcat) {
            const { done, value } = await reader.read();
            if (done) break;
            logQueue.push(value);
            if (!isProcessingQueue) {
                processLogQueue();
            }
        }
    } catch (error) {
        console.error('Failed to start Logcat, please check device connection status', error);
    } finally {
        await cleanupLogcat();
    }
};

// Process log queue asynchronously
const processLogQueue = async () => {
    isProcessingQueue = true;
    while (logQueue.length > 0 && !shouldStopLogcat) {
        const now = Date.now();
        if (now - lastUpdateTime >= UPDATE_INTERVAL) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            const batch = logQueue.splice(0, Math.min(100, logQueue.length));
            logs.value = [...logs.value, ...batch].slice(-MAX_LOGS);
            lastUpdateTime = now;
            if (isNearBottom.value) {
                scrollToBottom();
                await nextTick();
            }
        } else {
            await new Promise((resolve) =>
                setTimeout(resolve, UPDATE_INTERVAL - (now - lastUpdateTime))
            );
        }
    }
    isProcessingQueue = false;
};

// Stop Logcat
const stopLogcat = async () => {
    shouldStopLogcat = true;
    isRunning.value = false;

    // Wait for current read operation to complete
    if (reader) {
        try {
            await reader.cancel();
        } catch (error) {
            console.error('Error canceling reader:', error);
        }
    }

    await cleanupLogcat();
};

// Clean up Logcat resources
const cleanupLogcat = async () => {
    if (reader) {
        try {
            reader.releaseLock();
        } catch (error) {
            console.error('Error releasing reader lock:', error);
        }
        reader = null;
    }

    if (logStream) {
        try {
            await logStream.cancel();
        } catch (error) {
            console.error('Error canceling logStream:', error);
        }
        logStream = null;
    }

    if (abortController) {
        abortController.abort();
        abortController = null;
    }

    logcat = null;
    logQueue.length = 0;
};

// Clear logs
const clearLogs = async () => {
    try {
        if (logcat) {
            await logcat.clear();
        }
        logs.value = [];
        logQueue.length = 0;
    } catch (error) {
        console.error('Failed to clear logs, please retry', error);
    }
};

// Export logs
const exportLogs = () => {
    const logText = filteredLogs.value
        .map((log) => `${formatTime(log)} ${log.tag} ${log.message}`)
        .join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logcat_export_${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// Format time
const formatTime = (log: AndroidLogEntry): string => {
    const date = new Date(log.seconds * 1000 + log.nanoseconds / 1000000);
    return date.toISOString().replace('T', ' ').slice(0, -1);
};

// Get color corresponding to priority
const getPriorityColor = (priority: AndroidLogPriority): string => {
    return priorityColors[priority] || 'grey darken-2';
};

// Scroll to bottom
const scrollToBottom = () => {
    if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
};
</script>

<style scoped>
.device-logcat {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.device-logcat :deep(.v-card-text) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.log-scroll-area {
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.header {
    padding: 8px;
    border-bottom: 1px solid #e0e0e0;
}

.log-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
}

.log-header {
    display: flex;
    font-weight: bold;
    padding: 6px 6px;
    position: sticky;
    top: 0;
    z-index: 1;
    background-color: #fff;
}

.log-entry {
    display: flex;
    padding: 6px 5px;
    font-size: 0.9rem;
    border-bottom: 1px solid #f0f0f0;
    min-width: max-content;
}

.log-cell {
    padding: 0 10px;
}

.log-cell.time {
    flex: 0 0 210px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.log-cell.priority {
    flex: 0 0 50px;
    text-align: center;
}

.log-cell.tag {
    flex: 0 0 180px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.log-cell.message {
    flex: 1;
    min-width: 200px;
    white-space: nowrap;
    word-break: break-word;
}

.priority-chip {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.no-logs-message {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    color: #757575;
}

@media (max-width: 600px) {
    .log-cell.time {
        flex: 0 0 120px;
    }

    .log-cell.tag {
        flex: 0 0 100px;
    }
}
</style>
