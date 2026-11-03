/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import definePlugin, { OptionType } from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { FluxDispatcher, MediaEngineStore, SelectedChannelStore, Toasts, useState, useStateFromStores } from "@webpack/common";
import type { ReactNode } from "react";

const VoicePanelButton = findComponentByCodeLazy<{
    icon: ReactNode;
    tooltipText: string;
    "aria-label": string;
    "aria-checked": boolean;
    role: "switch";
    onClick(): void;
}>(".GREEN,positionKeyStemOverride:");

const REASON = "vencord_mic_monitor";
let running = false;
let lastChannel: string | undefined;

function changeMonitoring(enabled: boolean) {
    try {
        setMonitoring(enabled);
    } catch (error) {
        Toasts.show({ message: error instanceof Error ? error.message : "Mic monitoring failed.", type: Toasts.Type.FAILURE, id: Toasts.genId() });
    }
}

function syncVoiceChannel() {
    // Store notifications run during Flux dispatch; defer our dispatch until it ends.
    queueMicrotask(() => {
        if (!running) return;
        const channel = SelectedChannelStore.getVoiceChannelId();
        if (channel === lastChannel) return;
        lastChannel = channel;
        if (channel) changeMonitoring(true);
        else stopMonitoring();
    });
}

function MonitorButton() {
    const active = useStateFromStores([MediaEngineStore], isMonitoring);
    return (
        <VoicePanelButton
            role="switch" aria-checked={active}
            aria-label="Mic monitoring"
            tooltipText={active ? "Stop mic monitoring" : "Start mic monitoring"}
            onClick={() => changeMonitoring(!active)}
            icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                    style={{ color: active ? "var(--status-positive)" : "currentColor" }}>
                    <path d="M8 14c0-2-3-2.5-3-6a7 7 0 0 1 14 0c0 4-3 5-4 7-1 2-1 6-5 6a4 4 0 0 1-4-4"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
            }
        />
    );
}

function isMonitoring() {
    return MediaEngineStore.getLoopbackReasons().has(REASON);
}

function setMonitoring(enabled: boolean) {
    if (enabled && !running) throw new Error("Enable the plugin first.");
    if (enabled && !MediaEngineStore.getMediaEngine().supports("LOOPBACK")) {
        throw new Error("Mic monitoring is unavailable on this client.");
    }
    FluxDispatcher.dispatch({ type: "AUDIO_SET_LOOPBACK", loopbackReason: REASON, enabled });
}

function Controls() {
    const active = useStateFromStores([MediaEngineStore], isMonitoring);
    const [error, setError] = useState("");
    return (
        <section>
            <Paragraph>Listen to your microphone through Discord’s mic-test audio path. Use headphones.</Paragraph>
            <Paragraph>Monitoring during calls is experimental. This is not a copy of another person's received audio.</Paragraph>
            <Button variant={active ? "dangerPrimary" : "primary"} onClick={() => {
                try {
                    setMonitoring(!active);
                    setError("");
                } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not change monitoring.");
                }
            }}>{active ? "Stop monitoring" : "Start monitoring"}</Button>
            {error && <Paragraph role="alert">{error}</Paragraph>}
        </section>
    );
}

const settings = definePluginSettings({
    controls: {
        type: OptionType.COMPONENT,
        component: Controls
    }
});

function stopMonitoring() {
    if (isMonitoring()) setMonitoring(false);
}

export default definePlugin({
    name: "MicMonitor",
    description: "Hear your microphone using Discord's built-in loopback.",
    authors: [{ name: "komi-juru", id: 682762388143210549n }],
    settings,
    patches: [{
        find: "hasRemoteVoiceState:",
        replacement: {
            match: /(hasRemoteVoiceState:\i\}\)\}\),\(0,\i\.jsxs\)\(\i\.\i,\{grow:0,shrink:0,className:\i\.\i,children:\[)/,
            replace: "$1$self.renderMonitorButton(),"
        }
    }],
    renderMonitorButton: ErrorBoundary.wrap(MonitorButton, { noop: true }),
    start() {
        running = true;
        lastChannel = undefined;
        SelectedChannelStore.addChangeListener(syncVoiceChannel);
        syncVoiceChannel();
        window.addEventListener("beforeunload", stopMonitoring);
    },
    stop() {
        running = false;
        SelectedChannelStore.removeChangeListener(syncVoiceChannel);
        lastChannel = undefined;
        window.removeEventListener("beforeunload", stopMonitoring);
        stopMonitoring();
    },
    flux: {
        LOGOUT() {
            // Flux does not allow dispatching from inside another dispatch.
            queueMicrotask(stopMonitoring);
        }
    }
});
