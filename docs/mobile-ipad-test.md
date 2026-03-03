# Mobile + iPad Test Guide

This guide helps verify the redesigned login page on desktop emulation and real iPhone/iPad devices.

## Quick Start

1. Install dependencies (if needed):
   - `npm install`
2. Start the app:
   - `npm run dev`
   - or `npm run dev:lan`
3. Open locally on your computer:
   - `http://localhost:3000`

The app server already listens on `0.0.0.0:3000`, so LAN testing is supported.

## Desktop Device Emulation (Chrome)

1. Open `http://localhost:3000` in Chrome.
2. Open DevTools (`Cmd+Opt+I` on macOS).
3. Toggle Device Toolbar (`Cmd+Shift+M`).
4. Test these presets:
   - iPhone 14 Pro (393x852)
   - iPhone 15 Pro Max (430x932)
   - iPad (768x1024)
   - iPad Pro 11 (834x1194)
   - iPad Pro 12.9 (1024x1366)
5. Test both portrait and landscape for iPad presets.

## Real iPhone/iPad on Same Wi-Fi

1. Ensure laptop and iPhone/iPad are on the same Wi-Fi network.
2. Keep app running with `npm run dev`.
3. Find your laptop LAN IP:
   - macOS: `ipconfig getifaddr en0`
   - If blank, try: `ipconfig getifaddr en1`
4. On iPhone/iPad Safari, open:
   - `http://<YOUR_LAN_IP>:3000`
   - Example: `http://192.168.1.23:3000`
5. If it fails, allow incoming connections in macOS firewall for Node.js.

## Optional Static Preview on LAN

1. Build the app:
   - `npm run build`
2. Serve preview on LAN:
   - `npm run preview:lan`
3. Open:
   - `http://<YOUR_LAN_IP>:4173`

## Pass/Fail Checklist

### Layout and Overflow

- [ ] No horizontal scroll on all target viewports.
- [ ] Hero text and access card never overlap or crop.
- [ ] Changelog popup is visible and not cut off.

### Interaction

- [ ] Editor modal opens/closes correctly on touch.
- [ ] `Manage passcode` is visible and tappable.
- [ ] Change passcode validation messages appear correctly.

### Keyboard Behavior

- [ ] On iPhone/iPad, virtual keyboard does not hide active input/actions in modal.
- [ ] Can submit with Enter/Go key where expected.

### Functional Parity

- [ ] Guest login works unchanged.
- [ ] Editor login works unchanged.
- [ ] Default `123456` works when no stored password exists.
- [ ] Changelog flow remains usable on touch devices.

### Motion and Accessibility

- [ ] Animations feel smooth on iPad.
- [ ] With reduced motion enabled, heavy motion is disabled.

## Reset Test Password Back to Default

If you changed passcode during testing and want to return to default behavior:

1. Open browser devtools on the app.
2. In console:
   - `localStorage.removeItem('wayne_editor_password')`
3. Reload the page.
4. Editor password fallback is now `123456`.
