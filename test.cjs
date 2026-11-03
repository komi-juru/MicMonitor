const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../Vencord/node_modules/typescript');
const code = ts.transpileModule(fs.readFileSync(__dirname + '/index.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }
}).outputText;
const reasons = new Set(['mic_test']);
const actions = [];
let supported = true;
let channel;
const listeners = new Set();
const common = {
    SelectedChannelStore: {
        getVoiceChannelId: () => channel,
        addChangeListener: listener => listeners.add(listener),
        removeChangeListener: listener => listeners.delete(listener)
    },
    Toasts: { show() {}, Type: { FAILURE: 1 }, genId: () => 'test' },
    FluxDispatcher: { dispatch(action) {
        actions.push(action);
        if (action.enabled) reasons.add(action.loopbackReason); else reasons.delete(action.loopbackReason);
    } },
    MediaEngineStore: {
        getLoopbackReasons: () => reasons,
        getMediaEngine: () => ({ supports: feature => { assert.equal(feature, 'LOOPBACK'); return supported; } })
    },
    useState: () => ['', () => {}],
    useStateFromStores: (_, read) => read()
};
const mockRequire = id => {
    if (id === '@webpack') return { findComponentByCodeLazy: () => 'voice-panel-button' };
    if (id === '@components/ErrorBoundary') return { __esModule: true, default: { wrap: component => component } };
    if (id === '@webpack/common') return common;
    if (id === '@api/Settings') return { definePluginSettings: def => ({ def }) };
    if (id === '@utils/types') return { __esModule: true, default: p => p, OptionType: { COMPONENT: 1 } };
    return { Button: 'button', Paragraph: 'p' };
};
const moduleObject = { exports: {} };
const windowMock = new EventTarget();
const React = { createElement: (type, props, ...children) => ({ type, props, children }) };
new Function('require', 'module', 'exports', 'window', 'React', code)(mockRequire, moduleObject, moduleObject.exports, windowMock, React);
const plugin = moduleObject.exports.default;
const click = () => plugin.settings.def.controls.component().children.find(c => c?.type === 'button').props.onClick();
plugin.start();
assert.deepEqual([...reasons], ['mic_test'], 'Starting the plugin must not activate the microphone');
click(); assert.ok(reasons.has('vencord_mic_monitor'));
click(); assert.deepEqual([...reasons], ['mic_test'], 'Stop preserves Discord mic test');
supported = false; click(); assert.deepEqual([...reasons], ['mic_test']);
supported = true; click(); plugin.stop(); assert.deepEqual([...reasons], ['mic_test']);
plugin.start(); click(); windowMock.dispatchEvent(new Event('beforeunload')); assert.deepEqual([...reasons], ['mic_test']);
click(); plugin.flux.LOGOUT();
queueMicrotask(async () => {
    assert.deepEqual([...reasons], ['mic_test']);
    const update = async value => {
        channel = value;
        for (const listener of listeners) listener();
        await Promise.resolve();
    };
    await update('voice-a');
    assert.ok(reasons.has('vencord_mic_monitor'), 'Join starts monitoring');
    click();
    await update('voice-a');
    assert.ok(!reasons.has('vencord_mic_monitor'), 'Unrelated store updates preserve manual off');
    await update('voice-b');
    assert.ok(reasons.has('vencord_mic_monitor'), 'Switching channels starts monitoring');
    await update(undefined);
    assert.deepEqual([...reasons], ['mic_test'], 'Leave stops only this monitor');
    channel = 'voice-c';
    for (const listener of listeners) listener();
    plugin.stop();
    await Promise.resolve();
    assert.deepEqual([...reasons], ['mic_test'], 'Pending join cannot reactivate stopped plugin');
    assert.equal(listeners.size, 0);
    assert.ok(actions.every(a => a.type === 'AUDIO_SET_LOOPBACK' && a.loopbackReason === 'vencord_mic_monitor'));
    const source = fs.readFileSync(__dirname + '/../.validation/discord-web.js', 'utf8');
    const patch = plugin.patches[0].replacement;
    const pattern = new RegExp(patch.match.source.replaceAll('\\i', '[A-Za-z_$][\\w$]*'), 'g');
    assert.equal([...source.matchAll(pattern)].length, 1, 'Panel patch matches exactly once in Discord source');
    console.log('PASS: manual controls, auto join/switch/leave, cleanup race, mic-test isolation, and unique voice-panel patch.');
});
