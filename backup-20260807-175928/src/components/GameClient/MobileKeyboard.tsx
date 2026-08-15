import { useState, useRef, useCallback, useEffect } from 'react';

interface MobileKeyboardProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}

/**
 * Mobile Keyboard — sleek text input overlay for mobile touch devices.
 *
 * The RSC game canvas captures keydown events via TeaVM. On mobile there's no
 * physical keyboard, so we provide a floating button that opens a glassmorphic
 * input bar. Each typed character is forwarded to the game iframe in real-time
 * via the existing __r2hTypeChar / __r2hKeyDownHandler bridges.
 *
 * Detection: only renders on touch-capable devices (coarse pointer).
 */
export default function MobileKeyboard({ iframeRef }: MobileKeyboardProps) {
  const [isTouch, setIsTouch] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const prevTextRef = useRef('');
  const isComposingRef = useRef(false);

  // Detect touch device on mount
  useEffect(() => {
    const touch = window.matchMedia('(pointer: coarse)').matches ||
                  'ontouchstart' in window ||
                  navigator.maxTouchPoints > 0;
    setIsTouch(touch);
  }, []);

  // Forward a single character to the game iframe
  const forwardChar = useCallback((ch: string) => {
    const win = iframeRef.current?.contentWindow as any;
    if (!win) return;
    if (win.__r2hTypeChar) {
      win.__r2hTypeChar(ch);
    }
  }, [iframeRef]);

  // Forward a special key (Enter, Backspace, Tab) to the game iframe
  const forwardKey = useCallback((keyCode: number, key: string) => {
    const win = iframeRef.current?.contentWindow as any;
    if (!win) return;
    if (key === 'Enter' && win.__r2hTypeSpecial) {
      win.__r2hTypeSpecial('Enter');
      return;
    }
    // Generic keydown dispatch for Backspace etc.
    if (win.__r2hKeyDownHandler && win.__r2hCanvasRef) {
      win.__r2hKeyDownHandler.call(win.__r2hCanvasRef, new KeyboardEvent('keydown', {
        key, keyCode, which: keyCode, charCode: 0, bubbles: true, cancelable: true,
      }));
    }
  }, [iframeRef]);

  // Diff the input value and forward changes to the game
  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (isComposingRef.current) {
      // During IME composition, just update the text, don't forward
      setText(e.target.value);
      return;
    }

    const newValue = e.target.value;
    const oldValue = prevTextRef.current;

    if (newValue.length > oldValue.length && newValue.startsWith(oldValue)) {
      // Characters added at the end — forward each new char
      const added = newValue.slice(oldValue.length);
      for (const ch of added) {
        forwardChar(ch);
      }
    } else if (newValue.length < oldValue.length && oldValue.startsWith(newValue)) {
      // Characters deleted from the end — forward Backspace for each
      const deletedCount = oldValue.length - newValue.length;
      for (let i = 0; i < deletedCount; i++) {
        forwardKey(8, 'Backspace');
      }
    } else {
      // Complex change (autocorrect, mid-string edit, etc.)
      // Rewind: delete all old chars, then type all new chars
      for (let i = 0; i < oldValue.length; i++) {
        forwardKey(8, 'Backspace');
      }
      for (const ch of newValue) {
        forwardChar(ch);
      }
    }

    prevTextRef.current = newValue;
    setText(newValue);
  }, [forwardChar, forwardKey]);

  // Handle keydown for Enter
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      forwardKey(13, 'Enter');
      // Clear input after sending
      setText('');
      prevTextRef.current = '';
      // Keep focus for rapid chat
    }
  }, [forwardKey]);

  // IME composition tracking
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    // Process the composed text as input
    handleInput({ target: { value: (e.target as HTMLInputElement).value } } as any);
  }, [handleInput]);

  // Open/close the keyboard
  const openKeyboard = useCallback(() => {
    setIsOpen(true);
    prevTextRef.current = '';
    setText('');
    // Focus after render
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  const closeKeyboard = useCallback(() => {
    setIsOpen(false);
    inputRef.current?.blur();
  }, []);

  const handleSend = useCallback(() => {
    forwardKey(13, 'Enter');
    setText('');
    prevTextRef.current = '';
    // Keep keyboard open for rapid chat
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [forwardKey]);

  if (!isTouch) return null;

  return (
    <>
      {/* Floating keyboard toggle button — bottom-left of game frame */}
      {!isOpen && (
        <button
          className="mk-toggle"
          onClick={openKeyboard}
          title="Open keyboard"
          aria-label="Open keyboard"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="14" rx="2" />
            <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M10 14h.01M14 14h.01M18 14h.01M8 18h8" />
          </svg>
        </button>
      )}

      {/* Input bar overlay — slides up from bottom of game frame */}
      {isOpen && (
        <div className="mk-bar">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder="Type to chat…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="mk-input"
          />
          <button className="mk-send" onClick={handleSend} aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
          <button className="mk-close" onClick={closeKeyboard} aria-label="Close keyboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
