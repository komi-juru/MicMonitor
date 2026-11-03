# MicMonitor

Hear your microphone through Discord’s native mic monitor. Use headphones to avoid feedback.

## Install

Install [Git](https://git-scm.com/) and [Node.js](https://nodejs.org/), then run:

```sh
npm install -g pnpm
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
git clone https://github.com/komi-juru/MicMonitor.git src/userplugins/micMonitor
pnpm install
pnpm build
pnpm inject
```

Select your Discord installation, restart Discord, then enable **MicMonitor** in **Settings → Vencord → Plugins**.

## Use

Join a voice channel to start monitoring. Use the ear button in the voice panel to toggle it. Monitoring stops when you leave.

## Update

From your Vencord folder, run these commands and restart Discord:

```sh
git -C src/userplugins/micMonitor pull --ff-only
pnpm build
```
