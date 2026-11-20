import { createRoot } from 'react-dom/client';
import { PortalSwitchPreview } from './PortalSwitchPreview';

declare const __PORTAL_SWITCH_PREVIEW__: boolean;

const host = window.location.hostname;
const expectedHost = /^servsync-demo-[a-z0-9-]+-bencatchots-projects\.vercel\.app$/.test(host);
if (__PORTAL_SWITCH_PREVIEW__ && (expectedHost || host === '127.0.0.1' || host === 'localhost')) {
  createRoot(document.getElementById('root')!).render(<PortalSwitchPreview />);
}
