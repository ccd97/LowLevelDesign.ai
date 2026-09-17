import type { editor } from 'monaco-editor';

/**
 * Attaches middle-click fast scrolling (autoscroll) to Monaco Editor
 * and completely prevents Linux Chromium primary selection paste.
 */
export function attachMonacoFastScroll(
  codeEditor: editor.IStandaloneCodeEditor
): () => void {
  const domNode = codeEditor.getDomNode();
  if (!domNode) return () => {};

  let isAutoscrolling = false;
  let originX = 0;
  let originY = 0;
  let currentX = 0;
  let currentY = 0;
  let movedDistance = 0;
  let isDragging = false;
  let animFrameId: number | null = null;
  let indicatorEl: HTMLDivElement | null = null;
  let lastMiddleClickTime = 0;

  function createIndicator(x: number, y: number): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'monaco-autoscroll-indicator';
    el.style.position = 'fixed';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.transform = 'translate(-50%, -50%)';
    el.style.width = '36px';
    el.style.height = '36px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = 'rgba(24, 24, 27, 0.88)';
    el.style.border = '1.5px solid rgba(161, 161, 170, 0.5)';
    el.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.5)';
    el.style.zIndex = '99999';
    el.style.pointerEvents = 'none';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.backdropFilter = 'blur(6px)';

    el.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #60a5fa;">
        <circle cx="12" cy="12" r="2.5" fill="#60a5fa"></circle>
        <polyline points="12 2 8 6 16 6 12 2" fill="#60a5fa"></polyline>
        <polyline points="12 22 8 18 16 18 12 22" fill="#60a5fa"></polyline>
        <polyline points="2 12 6 8 6 16 2 12" fill="#60a5fa"></polyline>
        <polyline points="22 12 18 8 18 16 22 12" fill="#60a5fa"></polyline>
      </svg>
    `;
    document.body.appendChild(el);
    return el;
  }

  function startAutoscroll(e: MouseEvent) {
    if (isAutoscrolling) {
      stopAutoscroll();
      return;
    }

    isAutoscrolling = true;
    isDragging = true;
    originX = e.clientX;
    originY = e.clientY;
    currentX = e.clientX;
    currentY = e.clientY;
    movedDistance = 0;
    lastMiddleClickTime = Date.now();

    indicatorEl = createIndicator(originX, originY);
    document.body.style.cursor = 'all-scroll';

    function scrollLoop() {
      if (!isAutoscrolling) return;

      const dy = currentY - originY;
      const dx = currentX - originX;
      const absDy = Math.abs(dy);
      const absDx = Math.abs(dx);
      const deadZone = 8;

      if (absDy > deadZone) {
        const distY = absDy - deadZone;
        // Non-linear acceleration: starts gentle, scales up smoothly to 80px/frame
        const speedY = Math.sign(dy) * Math.min(80, Math.pow(distY * 0.18, 1.4));
        codeEditor.setScrollTop(codeEditor.getScrollTop() + speedY);
      }

      if (absDx > deadZone) {
        const distX = absDx - deadZone;
        const speedX = Math.sign(dx) * Math.min(60, Math.pow(distX * 0.18, 1.4));
        codeEditor.setScrollLeft(codeEditor.getScrollLeft() + speedX);
      }

      animFrameId = requestAnimationFrame(scrollLoop);
    }

    animFrameId = requestAnimationFrame(scrollLoop);

    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onWindowMouseUp, true);
    window.addEventListener('pointerup', onWindowMouseUp, true);
    window.addEventListener('mousedown', onWindowMouseDown, true);
    window.addEventListener('pointerdown', onWindowMouseDown, true);
    window.addEventListener('wheel', onWindowWheel, { capture: true, passive: false });
    window.addEventListener('keydown', onWindowKeyDown, true);
    window.addEventListener('blur', stopAutoscroll, true);
  }

  function onMouseMove(e: MouseEvent) {
    if (!isAutoscrolling) return;
    currentX = e.clientX;
    currentY = e.clientY;
    const dist = Math.hypot(currentX - originX, currentY - originY);
    if (dist > movedDistance) {
      movedDistance = dist;
    }
  }

  function onWindowMouseUp(e: MouseEvent) {
    if (e.button === 1) {
      lastMiddleClickTime = Date.now();
      // If user dragged more than 6px and released, stop immediately
      if (movedDistance > 6) {
        stopAutoscroll();
      } else {
        // Click-and-release: remain in autoscroll mode until next click/key
        isDragging = false;
      }
    }
  }

  function onWindowMouseDown(e: MouseEvent) {
    if (!isAutoscrolling) return;
    // Don't cancel on the initial middle mousedown
    if (e.button === 1 && isDragging) return;

    // Any other click (left, right, or another middle click) dismisses autoscroll
    stopAutoscroll();
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onWindowWheel(_e: WheelEvent) {
    if (isAutoscrolling) {
      stopAutoscroll();
    }
  }

  function onWindowKeyDown(_e: KeyboardEvent) {
    if (isAutoscrolling) {
      stopAutoscroll();
    }
  }

  function stopAutoscroll() {
    if (!isAutoscrolling) return;
    isAutoscrolling = false;
    isDragging = false;
    document.body.style.cursor = '';

    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    if (indicatorEl) {
      indicatorEl.remove();
      indicatorEl = null;
    }

    window.removeEventListener('mousemove', onMouseMove, true);
    window.removeEventListener('mouseup', onWindowMouseUp, true);
    window.removeEventListener('pointerup', onWindowMouseUp, true);
    window.removeEventListener('mousedown', onWindowMouseDown, true);
    window.removeEventListener('pointerdown', onWindowMouseDown, true);
    window.removeEventListener('wheel', onWindowWheel, true);
    window.removeEventListener('keydown', onWindowKeyDown, true);
    window.removeEventListener('blur', stopAutoscroll, true);
  }

  function handleMiddleDown(e: MouseEvent) {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      startAutoscroll(e);
    }
  }

  function handleAuxClick(e: MouseEvent) {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function handlePaste(e: ClipboardEvent) {
    if (Date.now() - lastMiddleClickTime < 400) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // Intercept events in capture phase on editor DOM node
  domNode.addEventListener('mousedown', handleMiddleDown, true);
  domNode.addEventListener('pointerdown', handleMiddleDown as EventListener, true);
  domNode.addEventListener('auxclick', handleAuxClick, true);
  domNode.addEventListener('paste', handlePaste, true);

  return () => {
    stopAutoscroll();
    domNode.removeEventListener('mousedown', handleMiddleDown, true);
    domNode.removeEventListener('pointerdown', handleMiddleDown as EventListener, true);
    domNode.removeEventListener('auxclick', handleAuxClick, true);
    domNode.removeEventListener('paste', handlePaste, true);
  };
}
