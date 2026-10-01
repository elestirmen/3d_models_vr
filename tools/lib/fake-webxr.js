/* Duman testi için en küçük sahte WebXR "immersive-ar" cihazı.
 *
 * Babylon'ın WebXR katmanının kullandığı yüzey kadar API sunar: oturum,
 * başvuru uzayı, XRWebGLLayer, görüntüleyici pozu, isabet testi (yüzey 1,2 m
 * önde, yerde) ve dokunma ("select"). Gerçek bir AR çalışma zamanı değildir;
 * amacı ar-babylon.js akışını (oturum → yüzey → yerleştir → kademe yükle →
 * durum iletisi) cihaz olmadan uçtan uca sınamaktır.
 *
 * Oturum sürerken window.requestAnimationFrame BEKLETİLİR: Chrome/Android
 * sürükleyici oturumda sayfa karelerini durdurabiliyor; kod yalnızca oturumun
 * kendi karesine (XRSession.requestAnimationFrame) güvenmelidir.
 *
 * Denetim: window.__fakeXR = { session, tap(), frames, pausedWindowFrames }.
 */
(() => {
  if (window.__fakeXR) return;
  const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const point = (p = {}, w = 1) => ({ x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0, w: p.w ?? w });

  class FakeXRRigidTransform {
    constructor(position, orientation) {
      this.position = point(position, 1);
      this.orientation = point(orientation, 1);
      const m = identity();
      m[12] = this.position.x;
      m[13] = this.position.y;
      m[14] = this.position.z;
      this.matrix = m;
    }
    get inverse() {
      return new FakeXRRigidTransform({ x: -this.position.x, y: -this.position.y, z: -this.position.z });
    }
  }

  class FakeXRRay {
    constructor(origin, direction) {
      this.origin = point(origin, 1);
      this.direction = point(direction || { z: -1 }, 0);
      this.matrix = identity();
    }
  }

  class FakeXRSpace extends EventTarget {
    getOffsetReferenceSpace() { return new FakeXRSpace(); }
  }

  // Görüntüleyici 1,6 m yükseklikte, -z'ye bakıyor; yüzey (zemin) 1,2 m önde.
  const viewerTransform = new FakeXRRigidTransform({ x: 0, y: 1.6, z: 0 });
  const floorHit = new FakeXRRigidTransform({ x: 0, y: 0, z: -1.2 });
  const projection = (() => {
    const f = 1 / Math.tan((60 * Math.PI / 180) / 2);
    const near = 0.1;
    const far = 1000;
    return new Float32Array([f / 0.75, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
  })();

  class FakeXRWebGLLayer {
    constructor(session, gl) {
      this.framebuffer = null;
      this.framebufferWidth = gl.drawingBufferWidth || 640;
      this.framebufferHeight = gl.drawingBufferHeight || 480;
      this.antialias = false;
      this.ignoreDepthValues = false;
      this.fixedFoveation = null;
    }
    getViewport() { return { x: 0, y: 0, width: this.framebufferWidth, height: this.framebufferHeight }; }
    static getNativeFramebufferScaleFactor() { return 1; }
  }

  const hitResult = { getPose: () => ({ transform: floorHit, emulatedPosition: false }), createAnchor: undefined };

  class FakeXRFrame {
    constructor(session) { this.session = session; this.predictedDisplayTime = performance.now(); this.trackedAnchors = new Set(); }
    getViewerPose() {
      return {
        transform: viewerTransform,
        emulatedPosition: false,
        views: [{ eye: 'none', projectionMatrix: projection, transform: viewerTransform, recommendedViewportScale: null, requestViewportScale() {} }],
      };
    }
    getPose() { return { transform: new FakeXRRigidTransform(), emulatedPosition: false }; }
    getHitTestResults() { return [hitResult]; }
    getHitTestResultsForTransientInput() { return []; }
  }

  class FakeXRHitTestSource { cancel() {} }

  const pausedWindowFrames = [];
  const realRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  let active = null;

  class FakeXRSession extends EventTarget {
    constructor(mode, init) {
      super();
      this.mode = mode;
      this.renderState = { baseLayer: null, depthNear: 0.1, depthFar: 1000, inlineVerticalFieldOfView: null, layers: [] };
      this.inputSources = [];
      this.enabledFeatures = ['local', 'local-floor', 'viewer', ...(init?.requiredFeatures || []), ...(init?.optionalFeatures || [])];
      this.environmentBlendMode = 'alpha-blend';
      this.interactionMode = 'screen-space';
      this.visibilityState = 'visible';
      this.domOverlayState = init?.domOverlay ? { type: 'screen' } : null;
      this.frameRate = 60;
      this.supportedFrameRates = new Float32Array([60]);
      this._callbacks = new Map();
      this._nextId = 1;
      this._ended = false;
      this._timer = window.setInterval(() => this._tick(), 16);
    }
    updateRenderState(state = {}) { Object.assign(this.renderState, state); }
    updateTargetFrameRate() { return Promise.resolve(); }
    requestReferenceSpace() { return Promise.resolve(new FakeXRSpace()); }
    requestHitTestSource() { return Promise.resolve(new FakeXRHitTestSource()); }
    requestHitTestSourceForTransientInput() { return Promise.resolve(new FakeXRHitTestSource()); }
    requestAnimationFrame(callback) {
      const id = this._nextId++;
      this._callbacks.set(id, callback);
      return id;
    }
    cancelAnimationFrame(id) { this._callbacks.delete(id); }
    _tick() {
      if (this._ended || !this.renderState.baseLayer) return;
      const callbacks = [...this._callbacks.values()];
      this._callbacks.clear();
      const frame = new FakeXRFrame(this);
      window.__fakeXR.frames += 1;
      for (const callback of callbacks) {
        try { callback(performance.now(), frame); } catch (error) { console.error('sahte XR karesi:', error); }
      }
    }
    end() {
      if (this._ended) return Promise.resolve();
      this._ended = true;
      window.clearInterval(this._timer);
      active = null;
      // Bekletilen pencere kareleri oturum bitince sürer (gerçek tarayıcı gibi).
      for (const callback of pausedWindowFrames.splice(0)) realRequestAnimationFrame(callback);
      this.dispatchEvent(new Event('end'));
      return Promise.resolve();
    }
  }

  window.requestAnimationFrame = (callback) => {
    if (active) {
      pausedWindowFrames.push(callback);
      return 0;
    }
    return realRequestAnimationFrame(callback);
  };

  const xr = new EventTarget();
  xr.isSessionSupported = mode => Promise.resolve(mode === 'immersive-ar' || mode === 'inline');
  xr.requestSession = (mode, init) => {
    if (mode !== 'immersive-ar') return Promise.reject(new DOMException('desteklenmiyor', 'NotSupportedError'));
    active = new FakeXRSession(mode, init);
    window.__fakeXR.session = active;
    return Promise.resolve(active);
  };
  Object.defineProperty(navigator, 'xr', { value: xr, configurable: true });
  // Masaüstü Chromium'da gerçek makeXRCompatible cihaz olmadığı için reddeder.
  for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
    const proto = window[name]?.prototype;
    if (proto) proto.makeXRCompatible = () => Promise.resolve();
  }
  Object.assign(window, {
    XRRigidTransform: FakeXRRigidTransform,
    XRRay: FakeXRRay,
    XRWebGLLayer: FakeXRWebGLLayer,
    XRSession: FakeXRSession,
    XRFrame: FakeXRFrame,
    XRHitTestSource: FakeXRHitTestSource,
  });

  window.__fakeXR = {
    session: null,
    frames: 0,
    get pausedWindowFrames() { return pausedWindowFrames.length; },
    /** Ekrana dokunma: oturuma "select" olayı. */
    tap() { active?.dispatchEvent(Object.assign(new Event('select'), { inputSource: { targetRayMode: 'screen' } })); },
  };
})();
