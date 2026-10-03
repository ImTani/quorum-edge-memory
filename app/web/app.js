// Standalone single-device page (index.html, served at "/" by each device). Mounts the device UI
// once against this origin. With ?mock=1 the same UI runs against mock.js, an in-browser fake API.
import { createDeviceUI } from './device.js';

const params = new URLSearchParams(location.search);
const MOCK = params.has('mock') && params.get('mock') !== '0';

let mock = null;
if (MOCK) {
  const { createMock } = await import('./mock.js');
  mock = createMock({ device: params.get('device') || 'tanishk' });
}

const ui = createDeviceUI(document.getElementById('app'), { base: '', transport: mock?.transport });
await ui.ready;
if (mock) mock.attach(ui.driver);
window.__quorum = { state: ui.state, cloud: ui.cloud, ready: true };
