# PANDASCRCPY · Android Screen Mirroring & Control in Browser

An open-source solution based on **WebUSB + scrcpy**: Use Chrome/Edge to USB-connect your Android device for low-latency mirroring, keyboard/mouse/touch control, recording, and remote viewing. **This repository contains the open-source core; the enhanced version (PANDAPERF) builds on this foundation with AI, multi-device control, and enterprise-grade performance capabilities, available for free.**

---

## Online Experience (Open Source Version)

1. Enable **USB Debugging** on your Android device and connect to computer via USB cable
2. Open **Chrome or Edge** browser and visit:  
   **[https://pandatestgrid.github.io/PandaScrcpy/](https://pandatestgrid.github.io/PandaScrcpy/)**
3. Follow on-screen prompts to authorize WebUSB access, then connect for screen mirroring and control

### Open Source Features Overview

| Feature | Description |
|---------|-------------|
| Screen Mirroring | WebCodecs decoding, smooth and low-latency |
| Touch / Keyboard / Mouse | Optimized focus and pointer tracking, reduced "stuck" issues |
| Recording / Screenshot | Local recording and snapshots |
| Remote Viewing | Share screen with another browser via PeerJS |
| Device-side Tools | App management, Logcat, ADB Shell terminal, etc. |

We recommend trying the **[Live Demo](https://pandatestgrid.github.io/panda-web-scrcpy/)** to see the real-time interface

---

## Enhanced Version PANDAPERF (Free)

**[→ Try Enhanced Version Now](https://www.pandatest.net/device)**  

Building upon the open-source screen mirroring, the enhanced version targets **development debugging, multi-device testing, and performance analysis** with capabilities including:

- **AI Assistant**: Multi-modal understanding + reasoning + **ADB execution loop** — describe tasks in natural language (like opening apps, searching, changing settings) and the assistant plans and executes them on the device
- **Multi-device Control**: Multiple devices on one screen, batch management, ideal for compatibility testing and script validation
- **Performance Workbench**: CPU / Memory / Network / GPU / Frame rate & stutter, battery monitoring with charts (timeline and multi-metric correlation)
- **Script Recording & Playback**: Record operation sequences for regression testing and automation
- **Virtual screens, screenshot timeline, visual comparison** and other enhanced features, continuously evolving

### Enhanced Version Interface Preview

<p align="center">
  <img src="docs/images/pandaperf-full-workbench.png" alt="PANDAPERF Enhanced Version: Multi-device screen mirroring, AI assistant, performance curves and CPU core view" width="920" />
</p>

*Above: Three devices mirrored simultaneously, AI assistant dialog on the right, performance timeline at bottom (CPU / frame rate / memory and other metrics correlation) with CPU core view.*

---

## Local Development (Open Source Version)

```bash
npm install
npm run dev
```

Build and preview:

```bash
npm run build
npm run preview
```

See `package.json` and `postinstall` scripts for dependencies and scrcpy-server version details.

---

## Contributing & License

PRs welcome: Fork → Branch → Commit → Pull Request  
License: **[MIT](LICENSE)**

## Acknowledgments

- [Tango / ya-webadb ecosystem](https://github.com/yume-chan) and **scrcpy** related projects
- Community contributors and user feedback

---

<p align="center">
  <b>Open Source Screen Mirroring · Enhanced AI + Multi-device + Performance · <a href="https://www.pandatest.net/device">Try PANDAPERF Free</a></b>
</p>