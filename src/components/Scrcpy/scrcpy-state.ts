// Import external dependencies
import { AdbDaemonWebUsbDevice } from '@yume-chan/adb-daemon-webusb';
import { AdbScrcpyClient, AdbScrcpyOptions3_3_3 } from '@yume-chan/adb-scrcpy';
// import { VERSION, BIN } from '@yume-chan/fetch-scrcpy-server';
import { PcmPlayer } from '@yume-chan/pcm-player';
import type {
    ScrcpyMediaStreamConfigurationPacket,
    ScrcpyMediaStreamDataPacket,
    ScrcpyMediaStreamPacket,
} from '@yume-chan/scrcpy';
import {
    clamp,
    DefaultServerPath,
    h264ParseConfiguration,
    ScrcpyCodecOptions,
    ScrcpyInstanceId,
    ScrcpyVideoCodecId,
} from '@yume-chan/scrcpy';
import type { VideoFrameRenderer } from "@yume-chan/scrcpy-decoder-webcodecs";
import {
    BitmapVideoFrameRenderer,
    WebCodecsVideoDecoder,
    WebGLVideoFrameRenderer,
} from "@yume-chan/scrcpy-decoder-webcodecs";
import { Consumable, InspectStream, ReadableStream, WritableStream } from '@yume-chan/stream-extra';

// Import local dependencies
import { ScrcpyKeyboardInjector } from './input';
import recorder from './recorder';

// @ts-ignore
//import SCRCPY_SERVER_BIN from '../../../public/scrcpy-server-v3.3.3?binary';
import SCRCPY_SERVER_BIN from '../../assets/scrcpy-server-v3.3.3?binary';

// Type definitions
type RotationListener = (rotation: number, prevRotation: number) => void;

// Constants definition
const DEFAULT_VIDEO_CODEC = 'h264';
const DEFAULT_MAX_SIZE = 1920;
const DEFAULT_DISPLAY_ID = 0;
const DEFAULT_POWER_ON = true;
const DEFAULT_BORDER_WIDTH = 6;
const DEFAULT_FPS = 30;
const DEFAULT_BITRATE = 8000000;

export class ScrcpyState {
    // Basic state
    running = false;
    fullScreenContainer: HTMLDivElement | null = null;
    rendererContainer: HTMLDivElement | null = null;
    canvas?: HTMLVideoElement | HTMLCanvasElement;
    isFullScreen = false;
    width = 0;
    height = 0;
    private _rotation = 0;
    private rotationListeners: RotationListener[] = [];
    // Decoder and video related
    decoder: WebCodecsVideoDecoder | undefined = undefined;
    videoCodec: 'h264' | 'h265' = DEFAULT_VIDEO_CODEC;
    videoBitRate = DEFAULT_BITRATE;
    maxSize = DEFAULT_MAX_SIZE;
    maxFps = DEFAULT_FPS;
    displayId = DEFAULT_DISPLAY_ID;
    powerOn = DEFAULT_POWER_ON;

    // Device and connection related
    device: AdbDaemonWebUsbDevice | undefined = undefined;
    scrcpy: AdbScrcpyClient<AdbScrcpyOptions3_3_3<boolean>> | undefined = undefined;
    keyboard: ScrcpyKeyboardInjector | undefined = undefined;
    audioPlayer: PcmPlayer<unknown> | undefined = undefined;

    // Performance metrics
    fps = '0';
    bitRatesCount = 0;
    connecting = false;

    constructor() {
        // Add default rotation listener
        this.addRotationListener((rotation: number, prevRotation: number) => {
            console.log(`Screen rotated from ${prevRotation} to ${rotation}`);
        });
    }

    // Rotation related methods
    get rotation(): number {
        return this._rotation;
    }

    set rotation(value: number) {
        if (this._rotation !== value) {
            const prevRotation = this._rotation;
            this._rotation = value;
            // Notify all listeners
            this.rotationListeners.forEach((listener) => {
                try {
                    listener(value, prevRotation);
                } catch (error) {
                    console.error('Rotation listener error:', error);
                }
            });
            // Trigger video container resize
            this.updateVideoContainer();
        }
    }

    get rotatedWidth(): number {
        return this.rotation & 1 ? this.height : this.width;
    }

    get rotatedHeight(): number {
        return this.rotation & 1 ? this.width : this.height;
    }

    // Add rotation listener
    addRotationListener(listener: RotationListener): void {
        this.rotationListeners.push(listener);
    }

    // Remove rotation listener
    removeRotationListener(listener: RotationListener): void {
        const index = this.rotationListeners.indexOf(listener);
        if (index !== -1) {
            this.rotationListeners.splice(index, 1);
        }
    }

    // Update video container
    updateVideoContainer(): void {
        if (!this.canvas || !this.rendererContainer) {
            return;
        }

        const containerRect = this.rendererContainer.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;

        if (
            containerWidth === 0 ||
            containerHeight === 0 ||
            this.width === 0 ||
            this.height === 0
        ) {
            return;
        }

        const containerAspectRatio = containerWidth / containerHeight;
        const videoAspectRatio = this.width / this.height;

        let width: number;
        let height: number;

        // Calculate actual video size, considering border width
        if (containerAspectRatio > videoAspectRatio) {
            // Use height as base
            height = containerHeight - DEFAULT_BORDER_WIDTH;
            width = height * videoAspectRatio;
        } else {
            // Use width as base
            width = containerWidth - DEFAULT_BORDER_WIDTH;
            height = width / videoAspectRatio;
        }

        // Set video size
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;

        // Set transform origin and position
        this.canvas.style.transformOrigin = 'center';
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = '50%';
        this.canvas.style.top = '50%';
        this.canvas.style.backgroundColor = 'transparent';

        // Set transform based on rotation angle
        let transform = 'translate(-50%, -50%)';
        switch (this.rotation) {
            case 1: // 90 degrees
                transform += ' rotate(90deg)';
                // Swap width and height
                [this.canvas.style.width, this.canvas.style.height] = [`${height}px`, `${width}px`];
                break;
            case 2: // 180 degrees
                transform += ' rotate(180deg)';
                break;
            case 3: // 270 degrees
                transform += ' rotate(270deg)';
                // Swap width and height
                [this.canvas.style.width, this.canvas.style.height] = [`${height}px`, `${width}px`];
                break;
        }
        this.canvas.style.transform = transform;

        // Set other styles
        this.canvas.style.maxWidth = '100%';
        this.canvas.style.maxHeight = '100%';
        this.canvas.style.objectFit = 'contain';
        this.canvas.style.pointerEvents = 'auto';
    }

    // Server related methods
    async pushServer(): Promise<void> {
        if (!this.device) {
            console.error('Device unavailable');
            return;
        }

        try {
            console.log('Starting to push server...', new Uint8Array(SCRCPY_SERVER_BIN).length);
            const stream = new ReadableStream<Consumable<Uint8Array>>({
                start(controller) {
                    controller.enqueue(new Consumable(new Uint8Array(SCRCPY_SERVER_BIN)));
                    controller.close();
                },
            });

            await AdbScrcpyClient.pushServer(this.device as any, stream);
        } catch (error) {
            console.error('Failed to push server:', error);
        }
    }

    // Packet type check
    private isConfigurationPacket(
        packet: ScrcpyMediaStreamPacket
    ): packet is ScrcpyMediaStreamConfigurationPacket {
        return packet.type === 'configuration';
    }

    private isDataPacket(packet: ScrcpyMediaStreamPacket): packet is ScrcpyMediaStreamDataPacket {
        return packet.type === 'data';
    }

    // Start method
    async start(device: AdbDaemonWebUsbDevice) {
        if (!device || this.rendererContainer === undefined) {
            throw new Error('Invalid parameters');
        }
        this.device = device;
        try {
            if (!this.decoder) {
                throw new Error('No available decoder');
            }
            this.connecting = true;
            await this.pushServer();
            const videoCodecOptions = new ScrcpyCodecOptions();
            const options = new AdbScrcpyOptions3_3_3({
                maxSize: this.maxSize,
                videoBitRate: this.videoBitRate,
                videoCodec: this.videoCodec,
                maxFps: this.maxFps,
                displayId: this.displayId,
                powerOn: this.powerOn,
                audio: false, // Disable audio
                logLevel: 'debug',
                scid: ScrcpyInstanceId.random(),
                sendDeviceMeta: false,
                sendDummyByte: false,
                videoCodecOptions,
            });

            this.scrcpy = await AdbScrcpyClient.start(
                this.device as any,
                DefaultServerPath,
                options
            );

            if (!this.scrcpy) {
                throw new Error('Failed to start scrcpy client');
            }

            this.scrcpy.output.pipeTo(
                new WritableStream<string>({
                    write(chunk) {
                        console.log(`[Server] ${chunk}`);
                    },
                })
            );

            if (this.scrcpy.videoStream) {
                const videoStream = await this.scrcpy.videoStream;
                if (!videoStream) {
                    throw new Error('Failed to get video stream');
                }
                const { metadata: videoMetadata, stream: videoPacketStream } = videoStream;
                // Initialize video size
                this.width = videoMetadata.width ?? 0;
                this.height = videoMetadata.height ?? 0;
                this.rotation = 0; // Initialize to 0, update later via metadata

                // Set recorder video metadata
                recorder.setVideoMetadata(videoMetadata);

                if (this.decoder && videoPacketStream) {
                    videoPacketStream
                        .pipeThrough(
                            new InspectStream((packet: ScrcpyMediaStreamPacket) => {
                                // Pass packet to recorder
                                recorder.addVideoPacket(packet);
                                try {
                                    if (this.isConfigurationPacket(packet)) {
                                        try {
                                            const { croppedWidth, croppedHeight } =
                                                h264ParseConfiguration(packet.data);
                                            if (croppedWidth > 0 && croppedHeight > 0) {
                                                this.width = croppedWidth;
                                                this.height = croppedHeight;
                                                // Update video container size
                                                this.updateVideoContainer();
                                            }
                                        } catch (error) {
                                            console.error('Error parsing config:', error);
                                        }
                                    } else if (this.isDataPacket(packet)) {
                                        // Update screen rotation state
                                        const metadata = packet.data;
                                        if (
                                            metadata &&
                                            typeof metadata === 'object' &&
                                            'rotation' in metadata
                                        ) {
                                            const rotation = (metadata as { rotation: number })
                                                .rotation;
                                            if (
                                                typeof rotation === 'number' &&
                                                rotation >= 0 &&
                                                rotation <= 3
                                            ) {
                                                this.rotation = rotation;
                                            }
                                        }
                                        if (packet.data instanceof Uint8Array) {
                                            this.bitRatesCount += packet.data.byteLength;
                                        }
                                    }
                                } catch (error) {
                                    console.error('Error processing packet:', error);
                                }
                            })
                        )
                        .pipeTo(this.decoder.writable)
                        .catch((error) => {
                            console.error('Error processing packet:', error);
                        });
                }
            }

            this.keyboard = new ScrcpyKeyboardInjector(this.scrcpy);
            this.scrcpy.exited.then(() => this.dispose());

            this.running = true;
            return this.scrcpy;
        } catch (e) {
            console.error(e);
            this.connecting = false;
            this.dispose();
            return;
        }
    }

    // Stop method
    async stop() {
        // First request to close client
        await this.scrcpy?.close();
        this.dispose();
    }

    // Cleanup method
    dispose(): void {
        // Otherwise some packets may still reach the decoder
        this.decoder?.dispose();
        this.decoder = undefined;
        this.keyboard?.dispose();
        this.keyboard = undefined;

        this.audioPlayer?.stop();
        this.audioPlayer = undefined;

        this.fps = '0';

        if (this.isFullScreen) {
            document.exitFullscreen();
            this.isFullScreen = false;
        }

        this.scrcpy = undefined;
        this.device = undefined;
        this.canvas = undefined;
        this.running = false;
        // Clear rotation listeners
        this.rotationListeners = [];
    }

    // Create video frame renderer
    createVideoFrameRenderer(): {
        renderer: VideoFrameRenderer;
        element: HTMLVideoElement | HTMLCanvasElement;
    } {
        // Prefer Canvas renderer for captureStream to capture video stream
        if (WebGLVideoFrameRenderer.isSupported) {
            const renderer = new WebGLVideoFrameRenderer();
            return { renderer, element: renderer.canvas as HTMLCanvasElement };
        }

        const renderer = new BitmapVideoFrameRenderer();
        return { renderer, element: renderer.canvas as HTMLCanvasElement };
    }

    setRendererContainer(container: HTMLDivElement): void {
        if (this.decoder?.renderer) {
            console.log('Renderer container changed', this.decoder);
            this.rendererContainer = null;
            container.removeChild(this.canvas);
        }

        this.fullScreenContainer = container;
        this.rendererContainer = container;

        // Ensure container can properly position child elements
        container.style.position = 'relative';
        container.style.overflow = 'hidden';
        container.style.backgroundColor = 'transparent';

        const { renderer, element } = this.createVideoFrameRenderer();
        this.decoder = new WebCodecsVideoDecoder({
            codec: ScrcpyVideoCodecId.H264,
            renderer,
        });
        container.appendChild(element);
        this.canvas = element;
        // Initialize video container
        this.updateVideoContainer();
    }

    getCanvas(): HTMLVideoElement | HTMLCanvasElement | undefined {
        if (!this.scrcpy) {
            return;
        }
        return this.canvas;
    }

    clientPositionToDevicePosition(clientX: number, clientY: number): { x: number; y: number } {
        const viewRect = this.canvas!.getBoundingClientRect();
        let pointerViewX = clamp((clientX - viewRect.x) / viewRect.width, 0, 1);
        let pointerViewY = clamp((clientY - viewRect.y) / viewRect.height, 0, 1);

        if (this.rotation & 1) {
            [pointerViewX, pointerViewY] = [pointerViewY, pointerViewX];
        }
        switch (this.rotation) {
            case 1:
                pointerViewY = 1 - pointerViewY;
                break;
            case 2:
                pointerViewX = 1 - pointerViewX;
                pointerViewY = 1 - pointerViewY;
                break;
            case 3:
                pointerViewX = 1 - pointerViewX;
                break;
        }

        return {
            x: pointerViewX * this.width,
            y: pointerViewY * this.height,
        };
    }
}

const state = new ScrcpyState();
export default state;
