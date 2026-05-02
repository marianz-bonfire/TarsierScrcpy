<script setup lang="ts">
import { AdbDaemonWebUsbDevice, AdbDaemonWebUsbDeviceWatcher } from '@yume-chan/adb-daemon-webusb';
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import client, { type UnifiedDeviceMeta, type WirelessDeviceMeta } from '../Scrcpy/adb-client';
import DeviceGuide from './DeviceGuide.vue';
import WirelessDeviceDialog from './WirelessDeviceDialog.vue';

const emit = defineEmits(['pair-device', 'remove-device', 'update-connection-status']);

const showDevices = ref(false);
const showWirelessDialog = ref(false);
const selected = shallowRef<UnifiedDeviceMeta | undefined>(undefined);
const usbDeviceList = shallowRef<AdbDaemonWebUsbDevice[]>([]);
const wirelessDeviceList = shallowRef<WirelessDeviceMeta[]>([]);
const watcher = shallowRef<AdbDaemonWebUsbDeviceWatcher | null>(null);
const errorMessage = ref('');
const errorDetails = ref('');
const isLoading = ref(false);
const deviceInfo = ref<{ model: string; androidVersion: string } | null>(null);
const connectionStatus = ref<'connected' | 'disconnected' | 'connecting'>('disconnected');
const autoReconnectAttempts = ref(0);
const maxAutoReconnectAttempts = 3;
const disconnectionMessage = ref('');

const deviceList = computed((): UnifiedDeviceMeta[] => {
    const allDevices: UnifiedDeviceMeta[] = [];
    
    // Add USB devices with type marker
    usbDeviceList.value.forEach(device => {
        allDevices.push({
            ...device,
            type: 'usb' as const,
        } as UnifiedDeviceMeta);
    });
    
    // Add wireless devices
    allDevices.push(...wirelessDeviceList.value);
    
    return allDevices;
});

const deviceOptions = computed(() => {
    return deviceList.value;
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** When USB/ADB transport layer appears to be occupied (by this page or other clients not released), disconnect first then reconnect */
const isTransportOccupiedError = (e: unknown): boolean => {
    const err = e as { name?: string; message?: string };
    const name = (err?.name ?? '').toLowerCase();
    const msg = (err?.message ?? String(e)).toLowerCase();
    if (name === 'networkerror' || name === 'securityerror') return true;
    if (msg.includes('failed to connect')) return true;
    if (msg.includes('claim')) return true;
    if (msg.includes('busy')) return true;
    if (msg.includes('access denied')) return true;
    if (msg.includes('could not open')) return true;
    return false;
};

const connectWithOccupancyRecovery = async (device: UnifiedDeviceMeta) => {
    try {
        await client.connect(device as any);
    } catch (first: unknown) {
        if (!isTransportOccupiedError(first)) {
            throw first;
        }
        await client.disconnect();
        await sleep(450);
        await client.connect(device as any);
    }
};

const selectDevice = async (device: any) => {
    if (selected.value?.serial === device?.serial && connectionStatus.value === 'connected') {
        return;
    }

    connectionStatus.value = 'connecting';
    isLoading.value = true;
    errorMessage.value = '';
    errorDetails.value = '';
    deviceInfo.value = null;
    emit('update-connection-status', false);
    try {
        await connectWithOccupancyRecovery(device);
        selected.value = device;
        connectionStatus.value = 'connected';
        showDevices.value = false;
        emit('pair-device', device);
        emit('update-connection-status', true);
        deviceInfo.value = {
            model: device.name || 'Unknown',
            androidVersion: 'Unknown',
        };
        autoReconnectAttempts.value = 0;
    } catch (error: any) {
        handleConnectionError(error);
    } finally {
        isLoading.value = false;
    }
};

const handleConnectionError = (error: any) => {
    if (error.message.includes('Unknown command: 48545541')) {
        errorMessage.value = 'Device connection failed: Unknown command';
        errorDetails.value = 'Please ensure the device supports ADB debugging and USB debugging is enabled in developer options.';
    } else if (
        error.name === 'DOMException' &&
        error.message.includes('The transfer was cancelled')
    ) {
        errorMessage.value = 'Device connection failed: USB transfer cancelled';
        errorDetails.value = 'Please reconnect the device and try again. If the issue persists, try restarting the device.';
    } else if (error.message.includes('No authenticator can handle the request')) {
        errorMessage.value = 'Device authentication failed: Cannot process authentication request';
        errorDetails.value =
            'Please check ADB authorization settings on the device. Click "Allow USB debugging" dialog on the device, then retry connection.';
    } else {
        errorMessage.value = `Device connection failed`;
        errorDetails.value =
            'This is usually caused by other ADB clients running. Run `adb kill-server` command to terminate other ADB processes, then reconnect the current device.';
    }
    emit('update-connection-status', false);
    connectionStatus.value = 'disconnected';
};

const retryConnection = async () => {
    if (selected.value) {
        await selectDevice(selected.value);
    }
};

const autoReconnect = async () => {
    if (autoReconnectAttempts.value < maxAutoReconnectAttempts) {
        await retryConnection();
        autoReconnectAttempts.value++;
    } else {
        errorMessage.value = 'Auto-reconnect failed';
        errorDetails.value = 'Please manually retry connection or check device status.';
    }
};

const toggleDevices = () => {
    showDevices.value = !showDevices.value;
};

const removeDevice = async (serial: string) => {
    isLoading.value = true;
    if (selected.value?.serial === serial) {
        selected.value = undefined;
        await client.disconnect();
        deviceInfo.value = null;
        emit('update-connection-status', false);
        connectionStatus.value = 'disconnected';
    }
    usbDeviceList.value = usbDeviceList.value.filter((device) => device.serial !== serial);
    
    // Also remove from wireless devices if applicable
    if (client.wirelessDevices.has(serial)) {
        client.removeWirelessDevice(serial);
        updateWirelessDeviceList();
    }
    
    emit('remove-device', serial);
    isLoading.value = false;
};

const updateUsbDeviceList = async () => {
    isLoading.value = true;
    try {
        usbDeviceList.value = await client.getUsbDeviceList();
    } catch (error: any) {
        errorMessage.value = 'Failed to get device list';
        errorDetails.value = `${error.message}. Please check device connection and try again.`;
    } finally {
        isLoading.value = false;
    }
    return usbDeviceList.value;
};

const updateWirelessDeviceList = () => {
    wirelessDeviceList.value = client.getWirelessDevices();
};

const handleAddWirelessDevice = async (config: { host: string; port: number }) => {
    isLoading.value = true;
    errorMessage.value = '';
    errorDetails.value = '';
    
    try {
        const device = client.addWirelessDevice(config.host, config.port);
        updateWirelessDeviceList();
        await selectDevice(device);
    } catch (error: any) {
        errorMessage.value = 'Failed to add wireless device';
        errorDetails.value = `${error.message}. Please ensure the device is reachable and ADB is enabled over network.`;
    } finally {
        isLoading.value = false;
    }
};

const handleAddDevice = async () => {
    errorMessage.value = '';
    errorDetails.value = '';
    try {
        const newDevice = await client.addUsbDevice();
        if (!newDevice) {
            return;
        }
        await updateUsbDeviceList();
        const toConnect =
            usbDeviceList.value.find((d) => d.serial === newDevice.serial) ?? newDevice;
        await selectDevice({
            ...toConnect,
            type: 'usb' as const,
        });
    } catch (error: any) {
        if (!errorMessage.value) {
            errorMessage.value = 'Failed to add device';
            errorDetails.value = `${error.message}. Please ensure the device is properly connected and USB debugging is enabled.`;
        }
    }
};

const openMenu = () => {
    showDevices.value = true;
};

const openWirelessDialog = () => {
    showWirelessDialog.value = true;
};

onMounted(async () => {
    const supported = client.isSupportedWebUsb;
    if (!supported) {
        errorMessage.value = 'Browser does not support WebUSB';
        errorDetails.value = 'Please use a modern browser that supports WebUSB, such as the latest versions of Chrome or Edge.';
        return;
    }

    await updateUsbDeviceList();
    updateWirelessDeviceList();
    watcher.value = new AdbDaemonWebUsbDeviceWatcher(async () => {
        await updateUsbDeviceList();
    }, navigator.usb);
});

onUnmounted(() => {
    if (watcher.value) {
        watcher.value.dispose();
    }
});

watch(deviceList, async (newList) => {
    if (selected.value) {
        const current = newList.find((device) => device.serial === selected.value?.serial);
        if (!current) {
            await client.disconnect();
            const disconnectedDeviceName = selected.value.name || selected.value.serial;
            selected.value = undefined;
            deviceInfo.value = null;
            errorMessage.value = 'Device disconnected';
            errorDetails.value = 'The selected device has been removed from the list. Please check device connection status.';
            disconnectionMessage.value = `Device ${disconnectedDeviceName} has been disconnected. Please check device connection status.`;
            emit('update-connection-status', false);
            connectionStatus.value = 'disconnected';
            await autoReconnect();
        } else {
            disconnectionMessage.value = '';
        }
    }
});

defineExpose({ handleAddDevice, openMenu, handleAddWirelessDevice, openWirelessDialog });
</script>

<template>
    <div class="paired-devices">
        <WirelessDeviceDialog 
            v-model="showWirelessDialog"
            @add-device="handleAddWirelessDevice"
        />
        
        <v-menu
            v-model="showDevices"
            transition="slide-y-transition"
            :close-on-content-click="false"
            min-width="300"
            max-width="420"
            location="bottom"
        >
            <template #activator="{ props }">
                <button class="device-trigger" v-bind="props">
                    <v-icon size="16" class="trigger-icon">mdi-cellphone-link</v-icon>
                    <span class="trigger-label">
                    {{ selected ? (selected.name || selected.serial) : 'Select Device' }}
                    </span>
                    <span
                        class="trigger-dot"
                        :class="connectionStatus === 'connected' ? 'trigger-dot--on' : 'trigger-dot--off'"
                    />
                    <v-icon size="14" class="trigger-chevron">mdi-chevron-down</v-icon>
                </button>
            </template>
            <div class="device-dropdown">
                <div class="dd-header">
                    <span class="dd-title">Devices</span>
                    <div class="dd-actions">
                        <v-menu location="start" transition="slide-x-transition">
                            <template #activator="{ props }">
                                <button class="dd-icon-btn" title="Add Device" v-bind="props">
                                    <v-icon size="18">mdi-plus</v-icon>
                                </button>
                            </template>
                            <v-list class="pa-0" min-width="200">
                                <v-list-item @click="handleAddDevice">
                                    <v-icon start size="16">mdi-usb</v-icon>
                                    <v-list-item-title>Add USB Device</v-list-item-title>
                                </v-list-item>
                                <v-list-item @click="openWirelessDialog">
                                    <v-icon start size="16">mdi-wifi</v-icon>
                                    <v-list-item-title>Add Wireless Device</v-list-item-title>
                                </v-list-item>
                            </v-list>
                        </v-menu>
                        <DeviceGuide />
                    </div>
                </div>

                <div v-if="errorMessage" class="dd-section">
                    <v-alert type="error" variant="tonal" density="compact" class="text-body-2">
                        <strong>{{ errorMessage }}</strong>
                        <div class="text-caption mt-1">{{ errorDetails }}</div>
                        <div class="mt-2 d-flex ga-2">
                            <v-btn v-if="selected" size="x-small" variant="text" @click="retryConnection">Retry</v-btn>
                        </div>
                    </v-alert>
                </div>

                <div v-if="disconnectionMessage" class="dd-section">
                    <v-alert type="warning" variant="tonal" density="compact" class="text-body-2">
                        {{ disconnectionMessage }}
                    </v-alert>
                </div>

                <div v-if="!deviceList.length" class="dd-section dd-empty">
                    <p class="text-body-2 text-medium-emphasis mb-3">No paired devices available</p>
                    <div class="d-flex gap-2">
                        <v-btn variant="outlined" size="small" flex @click="handleAddDevice">
                            <v-icon start size="16">mdi-usb</v-icon>
                            USB
                        </v-btn>
                        <v-btn variant="outlined" size="small" flex @click="openWirelessDialog">
                            <v-icon start size="16">mdi-wifi</v-icon>
                            Wireless
                        </v-btn>
                    </div>
                </div>

                <div v-else class="dd-list">
                    <button
                        v-for="device in deviceOptions"
                        :key="device.serial"
                        class="dd-item"
                        @click="selectDevice(device)"
                    >
                        <div class="dd-item-icon">
                            <v-icon size="20" color="secondary">
                                {{ (device as any).type === 'wireless' ? 'mdi-wifi' : 'mdi-cellphone' }}
                            </v-icon>
                        </div>
                        <div class="dd-item-info">
                            <span class="dd-item-name">{{ device.name || device.serial }}</span>
                            <span class="dd-item-serial">
                                {{ (device as any).type === 'wireless' ? '📡 Wireless' : '🔌 USB' }}
                                • {{ device.serial }}
                            </span>
                        </div>
                        <v-icon
                            v-if="selected?.serial === device.serial"
                            size="16"
                            color="success"
                            class="mr-1"
                        >
                            mdi-check-circle
                        </v-icon>
                        <button
                            class="dd-icon-btn"
                            title="Remove Device"
                            @click.stop="removeDevice(device.serial)"
                        >
                            <v-icon size="16">mdi-close</v-icon>
                        </button>
                    </button>
                </div>

                <div class="dd-footer">
                    <button class="dd-close-btn" @click="toggleDevices">Close</button>
                </div>
            </div>
        </v-menu>
    </div>
</template>

<style scoped>
.paired-devices {
    display: inline-block;
}

.device-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: rgb(var(--v-theme-surface));
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    color: rgba(24, 24, 27, 0.8);
    transition: border-color 0.15s, background 0.15s;
    outline: none;
    white-space: nowrap;
    max-width: 280px;
}

.device-trigger:hover {
    border-color: var(--border-hover);
    background: rgba(24, 24, 27, 0.02);
}

.trigger-icon {
    flex-shrink: 0;
    opacity: 0.5;
}

.trigger-label {
    overflow: hidden;
    text-overflow: ellipsis;
}

.trigger-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
}

.trigger-dot--on {
    background: #22c55e;
}

.trigger-dot--off {
    background: rgba(24, 24, 27, 0.2);
}

.trigger-chevron {
    opacity: 0.4;
    flex-shrink: 0;
}

.device-dropdown {
    background: rgb(var(--v-theme-surface));
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
    overflow: hidden;
    min-width: 300px;
    margin-top: 4px;
}

.dd-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px 8px;
}

.dd-title {
    font-size: 13px;
    font-weight: 600;
    color: rgba(24, 24, 27, 0.55);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.dd-actions {
    display: flex;
    gap: 4px;
    align-items: center;
}

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

.dd-section {
    padding: 0 14px 10px;
}

.dd-empty {
    padding: 16px 14px;
    text-align: center;
}

.dd-list {
    padding: 0 6px 4px;
}

.dd-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
}

.dd-item:hover {
    background: rgba(24, 24, 27, 0.04);
}

.dd-item-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: rgba(24, 24, 27, 0.04);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.dd-item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.dd-item-name {
    font-size: 13px;
    font-weight: 500;
    color: rgba(24, 24, 27, 0.85);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dd-item-serial {
    font-size: 11px;
    color: rgba(24, 24, 27, 0.4);
}

.dd-footer {
    padding: 8px 14px 12px;
    border-top: 1px solid var(--border);
}

.dd-close-btn {
    width: 100%;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: transparent;
    font-size: 13px;
    font-weight: 500;
    color: rgba(24, 24, 27, 0.6);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
}

.dd-close-btn:hover {
    background: rgba(24, 24, 27, 0.03);
    border-color: var(--border-hover);
}
</style>
