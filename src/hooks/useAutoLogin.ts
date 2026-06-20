import { useEffect, useRef } from 'react';

/**
 * Injects RSC credentials into the mudclient after successful auth.
 *
 * The compiled mudclient204 stores login state in global JS variables.
 * This hook sets those variables and fires the login action.
 *
 * Credential contract from the API:
 *   - rscUsername: max 12 chars, a-z 0-9 only (base-37 safe)
 *   - rscPassword: max 12 chars, a-z 0-9 only (base-37 safe)
 */
export function useAutoLogin(creds: { username: string; password: string } | null) {
  const injected = useRef(false);

  useEffect(() => {
    if (!creds || injected.current) return;

    const tryInject = () => {
      const w = window as any;

      // ── Strategy 1: Client exposes a global login function ───────
      if (typeof w.rscLogin === 'function') {
        w.rscLogin(creds.username, creds.password);
        injected.current = true;
        return true;
      }

      // ── Strategy 2: Client uses global state variables ───────────
      // These names match the decompiled mudclient204 field names
      if (w.mudclient || w.client) {
        const mc = w.mudclient || w.client;

        // The client stores credentials in these fields before
        // building the login packet
        if ('myUsername' in mc) mc.myUsername = creds.username;
        if ('myPassword' in mc) mc.myPassword = creds.password;

        // Also try the input field setters if they exist
        if (typeof mc.setUsername === 'function') mc.setUsername(creds.username);
        if (typeof mc.setPassword === 'function') mc.setPassword(creds.password);

        // Trigger the login action
        if (typeof mc.login === 'function') {
          mc.login(creds.username, creds.password);
        } else if (typeof mc.sendLogin === 'function') {
          mc.sendLogin();
        }

        injected.current = true;
        return true;
      }

      // ── Strategy 3: Canvas text input simulation ─────────────────
      // If the client renders its own text inputs on canvas,
      // we write to the hidden form fields that back them
      const userInput = document.querySelector<HTMLInputElement>(
        '#username-input, [name="username"], input[type="text"]'
      );
      const passInput = document.querySelector<HTMLInputElement>(
        '#password-input, [name="password"], input[type="password"]'
      );
      if (userInput && passInput) {
        setNativeValue(userInput, creds.username);
        setNativeValue(passInput, creds.password);

        // Find and click the login/submit button
        const loginBtn = document.querySelector<HTMLButtonElement>(
          '#login-btn, [data-action="login"], button[type="submit"]'
        );
        if (loginBtn) loginBtn.click();
        injected.current = true;
        return true;
      }

      return false;
    };

    // Try immediately, then retry every 500ms for up to 15 seconds
    // (the client may still be loading cache files)
    if (tryInject()) return;

    let attempts = 0;
    const maxAttempts = 30; // 30 × 500ms = 15s
    const interval = setInterval(() => {
      attempts++;
      if (tryInject() || attempts >= maxAttempts) {
        clearInterval(interval);
        if (attempts >= maxAttempts) {
          console.warn('[R2H] Could not find mudclient login interface after 15s.');
          console.warn('[R2H] Credentials are ready — manual login may be needed.');
          console.warn('[R2H] Username:', creds.username);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [creds]);
}

/**
 * Sets a React-compatible input value via the native input setter.
 * React's synthetic events don't pick up programmatic .value changes;
 * this bypasses that by dispatching through the native setter.
 */
function setNativeValue(el: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, 'value'
  )?.set;
  if (nativeSetter) nativeSetter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
