(() => {
  'use strict';

  let B = window.BABYLON || null;
  const layer = document.querySelector('#babylonArLayer');
  const canvas = document.querySelector('#babylonArCanvas');
  const statusEl = document.querySelector('#babylonArStatus');
  const progressWrap = document.querySelector('#babylonArProgressWrap');
  const progressEl = document.querySelector('#babylonArProgress');
  const exitButton = document.querySelector('#babylonArExit');

  let config = null;
  let supported = false;
  let ready = false;
  let preparing = null;
  let engine = null;
  let scene = null;
  let xr = null;
  let hitTest = null;
  let reticle = null;
  let placementRoot = null;
  let latestHit = null;
  let placed = false;
  let activeTier = null;
  let generation = 0;
  let selectHandler = null;
  let normalizationProfile = null;
  let placedAt = 0;
  let lastTierSwapAt = 0;
  let dragging = false;
  let gesture = null;
  let userScale = 1;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-babylon-src="${src}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.dataset.babylonSrc = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`${src} yüklenemedi`));
      document.head.appendChild(script);
    });
  }

  async function ensureBabylon() {
    if (!window.BABYLON?.Engine || !window.BABYLON?.SceneLoader) {
      await loadScript('assets/vendor/babylon-9.18.0/babylon.js?v=9.18.0');
      await loadScript('assets/vendor/babylon-9.18.0/babylonjs.loaders.min.js?v=9.18.0');
    }
    B = window.BABYLON;
    if (!B?.Engine || !B?.SceneLoader) throw new Error('Babylon motoru başlatılamadı');

    const decoder = name => new URL(
      `assets/vendor/babylon-9.18.0/decoders/${name}`,
      location.href
    ).toString();
    B.MeshoptCompression.Configuration = {
      decoder: { url: decoder('meshopt_decoder.js') },
    };
    B.KhronosTextureContainer2.URLConfig = {
      jsDecoderModule: decoder('babylon.ktx2Decoder.js'),
      wasmUASTCToASTC: decoder('uastc_astc.wasm'),
      wasmUASTCToBC7: decoder('uastc_bc7.wasm'),
      wasmUASTCToRGBA_UNORM: decoder('uastc_rgba8_unorm_v2.wasm'),
      wasmUASTCToRGBA_SRGB: decoder('uastc_rgba8_srgb_v2.wasm'),
      wasmUASTCToR8_UNORM: decoder('uastc_r8_unorm.wasm'),
      wasmUASTCToRG8_UNORM: decoder('uastc_rg8_unorm.wasm'),
      jsMSCTranscoder: decoder('msc_basis_transcoder.js'),
      wasmMSCTranscoder: decoder('msc_basis_transcoder.wasm'),
      wasmZSTDDecoder: decoder('zstddec.wasm'),
    };
  }

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(`oku-babylon-ar:${name}`, { detail }));
  }

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function setProgress(event) {
    if (!progressWrap || !progressEl) return;
    if (!event || !event.lengthComputable || !event.total) {
      progressWrap.classList.add('is-hidden');
      return;
    }
    const value = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
    progressEl.value = value;
    progressEl.textContent = `${value}%`;
    progressWrap.classList.remove('is-hidden');
  }

  function hideProgress() {
    progressWrap?.classList.add('is-hidden');
  }

  function resolveSameOrigin(value, base = location.href) {
    if (!value) return '';
    try {
      const url = new URL(value, base);
      return url.origin === location.origin ? url.toString() : '';
    } catch {
      return '';
    }
  }

  async function fetchJson(url) {
    if (!url) return null;
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function disposeTier(tier) {
    if (!tier) return;
    try { tier.container?.dispose(); } catch { /* kaynak zaten bırakılmış olabilir */ }
    try { tier.root?.dispose(); } catch { /* kaynak zaten bırakılmış olabilir */ }
  }

  function clearModel() {
    disposeTier(activeTier);
    activeTier = null;
    placed = false;
    placedAt = 0;
    lastTierSwapAt = 0;
    dragging = false;
    gesture = null;
    userScale = 1;
    normalizationProfile = null;
    latestHit = null;
    if (reticle) reticle.setEnabled(false);
  }

  function normalizeContainer(container, id) {
    container.addAllToScene();
    const root = new B.TransformNode(`oku-ar-tier-${id}`, scene);
    const nodes = [...container.transformNodes, ...container.meshes];
    const nodeSet = new Set(nodes);
    for (const node of nodes) {
      if (!node.parent || !nodeSet.has(node.parent)) node.parent = root;
    }

    let min = new B.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    let max = new B.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    let found = false;
    for (const mesh of container.meshes) {
      if (!mesh.getTotalVertices || mesh.getTotalVertices() === 0) continue;
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      min = B.Vector3.Minimize(min, box.minimumWorld);
      max = B.Vector3.Maximize(max, box.maximumWorld);
      found = true;
    }

    if (found && !normalizationProfile) {
      const size = max.subtract(min);
      const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
      const scale = 0.9 / maxDimension;
      const center = min.add(max).scale(0.5);
      normalizationProfile = {
        scale,
        position: new B.Vector3(-center.x * scale, -min.y * scale, -center.z * scale),
      };
    }
    if (normalizationProfile) {
      root.scaling.setAll(normalizationProfile.scale);
      root.position.copyFrom(normalizationProfile.position);
    }
    root.parent = placementRoot;
    root.setEnabled(false);
    return root;
  }

  async function loadTier(tier, token) {
    const label = tier.id === 'high' ? 'Yüksek' : tier.id === 'medium' ? 'Orta' : 'Düşük';
    setStatus(`${label} ayrıntılı model yükleniyor…`);
    setProgress({ lengthComputable: true, loaded: 0, total: 1 });
    const pathname = new URL(tier.src, location.href).pathname.toLowerCase();
    const pluginExtension = pathname.endsWith('.gltf') ? '.gltf' : '.glb';
    const container = await B.SceneLoader.LoadAssetContainerAsync(
      '',
      tier.src,
      scene,
      setProgress,
      pluginExtension
    );
    if (token !== generation) {
      container.dispose();
      return null;
    }
    const root = normalizeContainer(container, tier.id);
    return { id: tier.id, container, root };
  }

  async function swapTier(tier, token) {
    const next = await loadTier(tier, token);
    if (!next || token !== generation) return;
    next.root.setEnabled(placed);
    const previous = activeTier;
    activeTier = next;
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (token !== generation) return;
    if (previous) {
      previous.root.setEnabled(false);
      requestAnimationFrame(() => disposeTier(previous));
    }
    lastTierSwapAt = performance.now();
    hideProgress();
    setStatus(
      tier.id === 'high'
        ? 'Yüksek ayrıntı hazır.'
        : placed
          ? `${tier.id === 'medium' ? 'Orta' : 'Düşük'} ayrıntı hazır.`
          : 'Bir yüzeye dokunarak modeli yerleştirin.'
    );
    emit('tier', { tier: tier.id });
  }

  function arTriangleBudget() {
    const memory = Number(navigator.deviceMemory) || 4;
    const cores = Number(navigator.hardwareConcurrency) || 4;
    if (memory <= 3 || cores <= 4) return 320000;
    if (memory <= 4 || cores <= 6) return 450000;
    if (memory <= 6) return 650000;
    return 850000;
  }

  function tierFitsArBudget(tier) {
    const triangles = Number(tier.triangles);
    if (!Number.isFinite(triangles) || triangles <= 0) return tier.id === 'low';
    // Yüksek kademe için daha sert sınır: XR kamera ve yüzey takibine GPU payı bırak.
    const limit = tier.id === 'high'
      ? Math.min(600000, arTriangleBudget())
      : arTriangleBudget();
    return triangles <= limit;
  }

  function wait(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  async function waitForStableAr(token, cooldown = 2600) {
    while (token === generation && !placed) await wait(200);
    if (token !== generation) return false;
    const stableSince = Math.max(placedAt, lastTierSwapAt);
    const remaining = Math.max(0, cooldown - (performance.now() - stableSince));
    if (remaining) await wait(remaining);
    if (token !== generation) return false;

    const samples = [];
    for (let index = 0; index < 8; index += 1) {
      await wait(250);
      if (token !== generation || !placed) return false;
      samples.push(engine.getFps());
    }
    const average = samples.reduce((total, value) => total + value, 0) / samples.length;
    const minimum = Math.min(...samples);
    // 30 Hz çalışan cihazları da kabul et, fakat takipte belirgin düşüş varsa yükseltme yapma.
    return average >= 27 && minimum >= 20;
  }

  async function progressiveLoad(token) {
    try {
      let tiers = [{ id: 'low', src: config.model }];
      if (config.geometryLod) {
        const manifest = await fetchJson(config.geometryLod);
        const ids = Array.isArray(manifest?.tiers) ? manifest.tiers.map(tier => tier?.id).join(',') : '';
        if (manifest?.version !== 1 || ids !== 'low,medium,high') {
          throw new Error('Geçersiz geometri LOD manifesti');
        }
        tiers = manifest.tiers.map(tier => ({
          id: tier.id,
          src: resolveSameOrigin(tier.src, config.geometryLod),
          triangles: Number(tier.triangles) || 0,
          bytes: Number(tier.bytes) || 0,
        }));
        if (tiers.some(tier => !tier.src)) throw new Error('Geçersiz geometri LOD adresi');
      }

      for (const [index, tier] of tiers.entries()) {
        if (token !== generation) return;
        if (index > 0) {
          if (!tierFitsArBudget(tier)) {
            console.info(`AR ${tier.id} kademesi performans bütçesini aştığı için decode edilmedi.`, tier);
            continue;
          }
          setStatus(`${tier.id === 'high' ? 'Yüksek' : 'Orta'} kalite cihaz kararlılığı bekleniyor…`);
          if (!await waitForStableAr(token, index === 1 ? 2800 : 4500)) {
            if (token === generation) setStatus('Akıcı AR için mevcut kalite korunuyor.');
            break;
          }
        }
        await swapTier(tier, token);
        if (index > 0 && token === generation) {
          const remainsStable = await waitForStableAr(token, 1800);
          if (!remainsStable && token === generation) {
            setStatus('Kare hızı düştü; akıcı AR kalitesine geri dönülüyor…');
            await swapTier(tiers[index - 1], token);
            if (token === generation) setStatus('Akıcı AR için önceki kalite korundu.');
            break;
          }
        }
      }
    } catch (error) {
      if (token !== generation) return;
      hideProgress();
      setStatus(activeTier ? 'Ayrıntı yükseltilemedi; mevcut model korunuyor.' : 'Model AR içinde yüklenemedi.');
      console.error('Babylon AR kademeli yükleme hatası:', error);
      emit('error', { error });
    }
  }

  function placeAtLatestHit() {
    if (placed || !latestHit || !placementRoot) return;
    const scale = new B.Vector3();
    const rotation = new B.Quaternion();
    const position = new B.Vector3();
    latestHit.decompose(scale, rotation, position);
    placementRoot.position.copyFrom(position);
    placementRoot.rotationQuaternion = rotation;
    placementRoot.scaling.setAll(userScale);
    placed = true;
    placedAt = performance.now();
    activeTier?.root.setEnabled(true);
    reticle?.setEnabled(false);
    setStatus(activeTier
      ? 'Model yerleştirildi. Tek parmakla taşıyın; iki parmakla büyütüp döndürün.'
      : 'Model indiriliyor…');
    emit('placed');
  }

  function touchDistance(touches) {
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.hypot(dx, dy);
  }

  function touchAngle(touches) {
    return Math.atan2(
      touches[1].clientY - touches[0].clientY,
      touches[1].clientX - touches[0].clientX
    );
  }

  function isHudControl(target) {
    return Boolean(target?.closest?.('.babylon-ar-exit'));
  }

  function beginTouchGesture(event) {
    if (!placed || isHudControl(event.target)) return;
    event.preventDefault();
    if (event.touches.length >= 2) {
      dragging = false;
      reticle?.setEnabled(false);
      gesture = {
        type: 'transform',
        distance: Math.max(1, touchDistance(event.touches)),
        angle: touchAngle(event.touches),
        scale: userScale,
        rotation: placementRoot.rotationQuaternion?.clone() || B.Quaternion.Identity(),
      };
      setStatus('İki parmakla boyutlandırın ve döndürün.');
    } else if (event.touches.length === 1) {
      dragging = true;
      gesture = { type: 'drag' };
      setStatus('Model zeminde taşınıyor…');
    }
  }

  function updateTouchGesture(event) {
    if (!placed || !gesture || isHudControl(event.target)) return;
    event.preventDefault();
    if (gesture.type === 'drag' && event.touches.length === 1) {
      if (!latestHit) return;
      const hitScale = new B.Vector3();
      const hitRotation = new B.Quaternion();
      const hitPosition = new B.Vector3();
      latestHit.decompose(hitScale, hitRotation, hitPosition);
      placementRoot.position.copyFrom(hitPosition);
      return;
    }
    if (gesture.type === 'transform' && event.touches.length >= 2) {
      const ratio = touchDistance(event.touches) / gesture.distance;
      userScale = Math.max(0.2, Math.min(5, gesture.scale * ratio));
      placementRoot.scaling.setAll(userScale);
      const angleDelta = touchAngle(event.touches) - gesture.angle;
      const turn = B.Quaternion.RotationAxis(B.Axis.Y, -angleDelta);
      placementRoot.rotationQuaternion = gesture.rotation.multiply(turn);
    }
  }

  function endTouchGesture(event) {
    if (!placed || isHudControl(event.target)) return;
    if (event.touches.length >= 2) {
      beginTouchGesture(event);
      return;
    }
    if (event.touches.length === 1) {
      dragging = true;
      gesture = { type: 'drag' };
      return;
    }
    dragging = false;
    gesture = null;
    reticle?.setEnabled(false);
    placedAt = performance.now();
    setStatus('Konum hazır. Tek parmakla taşıyın; iki parmakla büyütüp döndürün.');
  }

  async function prepare() {
    if (preparing) return preparing;
    preparing = (async () => {
      if (!layer || !canvas || !navigator.xr || !window.isSecureContext) return false;
      supported = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
      if (!supported) {
        emit('support', { supported: false });
        return false;
      }
      await ensureBabylon();

      engine = new B.Engine(canvas, true, { alpha: true, preserveDrawingBuffer: false, stencil: true });
      scene = new B.Scene(engine);
      scene.clearColor = new B.Color4(0, 0, 0, 0);
      new B.FreeCamera('oku-ar-preview-camera', new B.Vector3(0, 1.5, -2), scene);
      new B.HemisphericLight('oku-ar-light', new B.Vector3(0, 1, 0), scene).intensity = 1.25;
      placementRoot = new B.TransformNode('oku-ar-placement-root', scene);

      reticle = B.MeshBuilder.CreateTorus('oku-ar-reticle', {
        diameter: 0.16,
        thickness: 0.008,
        tessellation: 48,
      }, scene);
      reticle.rotation.x = Math.PI / 2;
      const reticleMaterial = new B.StandardMaterial('oku-ar-reticle-material', scene);
      reticleMaterial.emissiveColor = new B.Color3(0.23, 0.51, 0.96);
      reticleMaterial.disableLighting = true;
      reticle.material = reticleMaterial;
      reticle.isPickable = false;
      reticle.setEnabled(false);

      xr = await scene.createDefaultXRExperienceAsync({
        disableDefaultUI: true,
        disablePointerSelection: true,
        disableTeleportation: true,
        disableNearInteraction: true,
        disableHandTracking: true,
        uiOptions: { sessionMode: 'immersive-ar', referenceSpaceType: 'local-floor' },
      });
      hitTest = xr.baseExperience.featuresManager.enableFeature(
        B.WebXRFeatureName.HIT_TEST,
        'latest',
        { enableTransientHitTest: true }
      );
      hitTest.onHitTestResultObservable.add(results => {
        if (!results?.length) return;
        const preferredResult = dragging
          ? (results.find(result => result.isTransient) || results[0])
          : (results.find(result => !result.isTransient) || results[0]);
        latestHit = preferredResult.transformationMatrix.clone();
        const hitScale = new B.Vector3();
        const hitRotation = new B.Quaternion();
        const hitPosition = new B.Vector3();
        latestHit.decompose(hitScale, hitRotation, hitPosition);
        if (!placed || dragging) {
          reticle.position.copyFrom(hitPosition);
          reticle.rotationQuaternion = hitRotation;
          reticle.rotate(B.Axis.X, Math.PI / 2, B.Space.LOCAL);
          reticle.setEnabled(true);
        }
        if (!placed) {
          setStatus(activeTier ? 'Halka görünen yüzeye dokunarak modeli yerleştirin.' : 'Yüzey bulundu; düşük model hazırlanıyor…');
        }
      });
      xr.baseExperience.onStateChangedObservable.add(state => {
        if (state === B.WebXRState.NOT_IN_XR && !layer.classList.contains('is-hidden')) {
          endSessionUi();
        }
      });
      engine.runRenderLoop(() => scene.render());
      window.addEventListener('resize', () => engine?.resize());
      ready = true;
      emit('support', { supported: true });
      return true;
    })().catch(error => {
      console.warn('Babylon WebXR hazırlanamadı:', error);
      supported = false;
      ready = false;
      emit('support', { supported: false, error });
      return false;
    });
    return preparing;
  }

  function endSessionUi() {
    generation += 1;
    const session = xr?.baseExperience?.sessionManager?.session;
    if (session && selectHandler) session.removeEventListener('select', selectHandler);
    selectHandler = null;
    clearModel();
    hideProgress();
    layer.classList.add('is-hidden');
    layer.setAttribute('aria-hidden', 'true');
    emit('ended');
  }

  async function start() {
    if (!ready || !xr || !config) throw new Error('WebXR henüz hazır değil');
    generation += 1;
    const token = generation;
    clearModel();
    setStatus('Kamera ve yüzey algılama başlatılıyor…');
    layer.classList.remove('is-hidden');
    layer.setAttribute('aria-hidden', 'false');
    engine.resize();

    try {
      // Kullanıcı etkileşimi kaybolmadan ilk yapılan asenkron işlem XR oturumudur.
      await xr.baseExperience.enterXRAsync(
        'immersive-ar',
        'local-floor',
        xr.renderTarget,
        {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['dom-overlay'],
          domOverlay: { root: layer },
        }
      );
      const session = xr.baseExperience.sessionManager.session;
      selectHandler = placeAtLatestHit;
      session.addEventListener('select', selectHandler);
      setStatus('Kamerayı yavaşça zeminde sağa ve sola hareket ettirin.');
      emit('started');
      void progressiveLoad(token);
    } catch (error) {
      endSessionUi();
      throw error;
    }
  }

  async function exit() {
    if (!xr) return;
    await xr.baseExperience.exitXRAsync().catch(() => {});
    endSessionUi();
  }

  exitButton?.addEventListener('click', () => void exit());
  layer?.addEventListener('touchstart', beginTouchGesture, { passive: false });
  layer?.addEventListener('touchmove', updateTouchGesture, { passive: false });
  layer?.addEventListener('touchend', endTouchGesture, { passive: false });
  layer?.addEventListener('touchcancel', endTouchGesture, { passive: false });
  layer?.addEventListener('beforexrselect', event => {
    if (placed && !isHudControl(event.target)) event.preventDefault();
  });

  window.OKU_BABYLON_AR = {
    configure(nextConfig) {
      config = {
        title: nextConfig?.title || '3B Model',
        model: resolveSameOrigin(nextConfig?.model),
        geometryLod: resolveSameOrigin(nextConfig?.geometryLod),
      };
      if (!config.model) return Promise.resolve(false);
      return prepare();
    },
    canStart: () => Boolean(ready && supported && config?.model),
    isSupported: () => Boolean(supported),
    start,
    exit,
  };
})();
