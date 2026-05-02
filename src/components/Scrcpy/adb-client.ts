import { Adb, AdbDaemonTransport, type AdbPacketData } from '@yume-chan/adb';
import AdbWebCredentialStore from '@yume-chan/adb-credential-web';
import { AdbDaemonWebUsbDevice, AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb';
import { Consumable, ReadableStream, WritableStream } from '@yume-chan/stream-extra';

export interface DeviceMeta {
    serial: string;
    name?: string;
    type: 'usb' | 'wireless';
    connect: () => Promise<{
        readable: ReadableStream<AdbPacketData>;
        writable: WritableStream<Consumable<AdbPacketData>>;
    }>;
}

export interface WirelessDeviceMeta extends DeviceMeta {
    host: string;
    port: number;
}

// Wrapper to add DeviceMeta properties to AdbDaemonWebUsbDevice
export type UnifiedDeviceMeta = DeviceMeta | (AdbDaemonWebUsbDevice & { type: 'usb' });


export class AdbClient {
    device: Adb | undefined;
    serial: string | undefined;
    name: string | undefined;
    credentialStore: AdbWebCredentialStore;
    wirelessDevices: Map<string, WirelessDeviceMeta> = new Map();

    constructor() {
        this.credentialStore = new AdbWebCredentialStore('high-qa');
        this.loadWirelessDevices();
    }

    get isSupportedWebUsb() {
        return !!AdbDaemonWebUsbDeviceManager.BROWSER;
    }

    get isConnected() {
        return !!this.device;
    }

    get deviceName() {
        return this.name;
    }

    get deviceSerial() {
        return this.serial;
    }

    async connect(deviceMeta: DeviceMeta) {
        if (this.device) {
            await this.disconnect();
        }
        let readable: ReadableStream<AdbPacketData>;
        let writable: WritableStream<Consumable<AdbPacketData>>;
        try {
            const streams = await deviceMeta.connect();
            readable = streams.readable;
            writable = streams.writable;
        } catch (e: any) {
            if (typeof e === 'object' && e !== null && 'name' in e && e.name === 'NetworkError') {
                throw new Error(
                    'Failed to connect to device. Please check if the device is connected and try again.'
                );
            }
            throw e instanceof Error ? e : new Error(String(e));
        }

        this.device = new Adb(
            await AdbDaemonTransport.authenticate({
                serial: deviceMeta.serial,
                connection: { readable, writable },
                credentialStore: this.credentialStore,
            })
        );
        this.serial = await this.device.getProp('ro.serialno');
        this.name = await this.device.getProp('ro.product.model');

        return this.device;
    }

    async disconnect() {
        if (!this.device) {
            return;
        }
        await this.device.close();
        this.device = undefined;
        this.serial = undefined;
        this.name = undefined;
    }

    /**
     * Terminate residual scrcpy server on device to avoid port/process occupation that prevents re-streaming.
     * Depends on established Adb session; failures are silently ignored.
     */
    async killScrcpyServerOnDevice(): Promise<void> {
        const adb = this.device;
        if (!adb?.subprocess?.noneProtocol) {
            return;
        }
        try {
            await adb.subprocess.noneProtocol.spawnWaitText(
                "sh -c 'pkill -9 -f com.genymobile.scrcpy 2>/dev/null; pkill -9 -f scrcpy 2>/dev/null; true'",
            );
        } catch {
            // Ignore when no pkill, permission, or process does not exist
        }
    }

    async addUsbDevice() {
        return await AdbDaemonWebUsbDeviceManager.BROWSER!.requestDevice();
    }

    async getUsbDeviceList() {
        return await AdbDaemonWebUsbDeviceManager.BROWSER!.getDevices();
    }

    /**
     * Load wireless devices from localStorage
     */
    private loadWirelessDevices() {
        try {
            const stored = localStorage.getItem('wireless-devices');
            if (stored) {
                const devices = JSON.parse(stored);
                devices.forEach((device: WirelessDeviceMeta) => {
                    this.wirelessDevices.set(device.serial, device);
                });
            }
        } catch (error) {
            console.error('Failed to load wireless devices:', error);
        }
    }

    /**
     * Save wireless devices to localStorage
     */
    private saveWirelessDevices() {
        try {
            const devices = Array.from(this.wirelessDevices.values());
            localStorage.setItem('wireless-devices', JSON.stringify(devices));
        } catch (error) {
            console.error('Failed to save wireless devices:', error);
        }
    }

    /**
     * Get all wireless devices
     */
    getWirelessDevices(): WirelessDeviceMeta[] {
        return Array.from(this.wirelessDevices.values());
    }

    /**
     * Add a wireless device by IP and port
     */
    addWirelessDevice(host: string, port: number = 5555): WirelessDeviceMeta {
        const serial = `${host}:${port}`;
        const device: WirelessDeviceMeta = {
            serial,
            name: `${host}:${port}`,
            type: 'wireless',
            host,
            port,
            connect: async () => {
                return await this.connectTcpDevice(host, port);
            }
        };
        this.wirelessDevices.set(serial, device);
        this.saveWirelessDevices();
        return device;
    }

    /**
     * Remove a wireless device
     */
    removeWirelessDevice(serial: string) {
        this.wirelessDevices.delete(serial);
        this.saveWirelessDevices();
    }

    /**
     * Connect to device via TCP (wireless)
     */
    private async connectTcpDevice(host: string, port: number) {
        // For web environments, TCP connections require a proxy service
        // This creates the streams that the ADB protocol needs
        const controller = new AbortController();
        
        return new Promise<{ readable: ReadableStream<AdbPacketData>; writable: WritableStream<Consumable<AdbPacketData>> }>((resolve, reject) => {
            const connectTimeout = setTimeout(() => {
                controller.abort();
                reject(new Error(`Connection timeout: unable to reach device at ${host}:${port}`));
            }, 10000);

            // Create a duplex stream for TCP communication
            // This assumes the device has adb over network enabled (tcp:5555)
            const tcpAddress = `${host}:${port}`;
            
            // Attempt to establish connection using fetch-based approach
            // In production, you'd route this through a backend proxy
            this.createTcpConnection(tcpAddress, controller)
                .then(({ readable, writable }) => {
                    clearTimeout(connectTimeout);
                    resolve({ readable, writable });
                })
                .catch((error) => {
                    clearTimeout(connectTimeout);
                    reject(error);
                });
        });
    }

    /**
     * Create a TCP connection stream
     * Note: In a real web environment, this should route through a backend proxy
     */
    private async createTcpConnection(
        address: string,
        controller: AbortController
    ): Promise<{
        readable: ReadableStream<AdbPacketData>;
        writable: WritableStream<Consumable<AdbPacketData>>;
    }> {
        // This is a placeholder for actual TCP connection logic
        // In production, you would:
        // 1. Use a backend proxy service that handles raw TCP
        // 2. Or use a service worker with TCP capability
        // 3. Or implement a custom socket proxy

        // For now, create mock streams that will be populated by actual transport
        let resolveReadable: ((value: ReadableStreamDefaultReader<Uint8Array>) => void) | null = null;
        let resolveWritable: ((value: WritableStreamDefaultWriter<Consumable<AdbPacketData>>) => void) | null = null;

        const readable = new ReadableStream<AdbPacketData>({
            async start(controller) {
                // Initialize connection
                try {
                    // TODO: Implement actual TCP connection
                    // This is where you'd connect to ${address}
                } catch (error) {
                    controller.error(error);
                }
            },
        });

        const writable = new WritableStream<Consumable<AdbPacketData>>({
            async write(chunk) {
                // Send data over TCP
                // TODO: Implement actual TCP send
            },
        });

        return { readable, writable };
    }
}

const client = new AdbClient();
export default client;
