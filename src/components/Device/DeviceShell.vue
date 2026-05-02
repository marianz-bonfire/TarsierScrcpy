<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { encodeUtf8 } from '@yume-chan/adb';
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import client from '../Scrcpy/adb-client';

const term = ref<HTMLDivElement | null>(null);

let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let termResizeObserver: ResizeObserver | null = null;

function fitTerminal() {
    try {
        fitAddon?.fit();
    } catch {
        /* May throw error when container size is 0 */
    }
}

onMounted(async () => {
    try {
        await startTerminal();
    } catch (error) {
        console.error('Error starting terminal:', error);
    }
});

onUnmounted(() => {
    termResizeObserver?.disconnect();
    termResizeObserver = null;
    terminal?.dispose();
    terminal = null;
    fitAddon = null;
});

async function startTerminal() {
    termResizeObserver?.disconnect();
    termResizeObserver = null;
    if (terminal) {
        terminal.dispose();
        terminal = null;
    }
    if (!client.device) {
        console.error('Device not set');
        return;
    }
    terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        fontFamily: 'Roboto Mono, monospace',
        fontSize: 14,
        lineHeight: 1.2,
        allowTransparency: false,
        theme: {
            background: '#000000',
            foreground: '#e8e8e8',
            cursor: '#e74c3c',
            black: '#000000',
            red: '#e74c3c',
            green: '#2ecc71',
            yellow: '#f1c40f',
            blue: '#3498db',
            magenta: '#9b59b6',
            cyan: '#1abc9c',
            white: '#e8e8e8',
        },
    });

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    if (term.value) {
        termResizeObserver?.disconnect();
        terminal.open(term.value);
        await nextTick();
        requestAnimationFrame(() => {
            fitTerminal();
        });
        termResizeObserver = new ResizeObserver(() => {
            fitTerminal();
        });
        termResizeObserver.observe(term.value);
    } else {
        console.error('Terminal container not found');
        return;
    }

    const process = await client.device?.subprocess.shellProtocol!.pty();
    if (!process) {
        console.error('Failed to get subprocess');
        return;
    }

    process.output
        .pipeTo(
            new WritableStream({
                write(chunk) {
                    terminal?.write(chunk);
                },
            }) as any
        )
        .catch((error) => {
            console.error('Output stream error:', error);
        });

    const writer = process.input.getWriter();
    terminal.onData((data) => {
        const buffer = encodeUtf8(data);
        writer.write(buffer).catch((error) => {
            console.error('Write stream error:', error);
        });
    });
}

function clearTerminal() {
    if (terminal) {
        terminal.clear();
    }
}
</script>

<template>
    <div class="device-shell-card">
        <div class="shell-toolbar">
            <span class="shell-title">Device Terminal</span>
            <div class="shell-actions">
                <v-btn color="primary" variant="text" size="small" @click="startTerminal" class="mr-1">
                    <v-icon size="16">mdi-restart</v-icon>
                    Restart
                </v-btn>
                <v-btn color="secondary" variant="text" size="small" @click="clearTerminal">
                    <v-icon size="16">mdi-delete</v-icon>
                    Clear
                </v-btn>
            </div>
        </div>
        <div ref="term" class="terminal-container" />
    </div>
</template>

<style scoped>
.device-shell-card {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

.shell-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
}

.shell-title {
    font-size: 13px;
    font-weight: 600;
    color: rgba(24, 24, 27, 0.85);
}

.shell-actions {
    display: flex;
    align-items: center;
}

.terminal-container {
    flex: 1;
    min-height: 0;
    width: 100%;
    padding: 0;
    position: relative;
    background-color: #000000;
    overflow: hidden;
}

/* xterm by default does not fill height with flex parent, need to force fill container */
.terminal-container :deep(.xterm) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0 !important;
    margin: 0 !important;
    box-sizing: border-box;
}

.terminal-container :deep(.xterm-viewport),
.terminal-container :deep(.xterm-screen) {
    background-color: #000000 !important;
    padding: 0 !important;
    margin: 0 !important;
    box-sizing: border-box;
}

.terminal-container :deep(.xterm-screen canvas) {
    left: 0 !important;
    top: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
}
</style>
