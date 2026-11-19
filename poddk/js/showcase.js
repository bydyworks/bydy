// 진열대: 창 안의 작은 화면에 물건 하나를 3D 로 빙글빙글 돌려 보여 준다 (낚은 것, 선물에서 나온 아이템).
// 그림판(WebGL) 하나를 만들어 두고 돌려 쓴다. 보여 줄 곳(div)에 그림판을 옮겨 붙인다.
import * as THREE from 'three';

export function createShowcase() {
  let renderer = null, scene = null, camera = null, holder = null, current = null, raf = 0, t = 0, last = 0, spin = 1.3, onFrame = null, snap = null;
  function setup() {
    if (renderer) return true;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false }); } catch { renderer = null; return false; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'showcase-canvas';
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9d3ee', 2.1));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2); sun.position.set(2, 3, 4); scene.add(sun);
    camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    return true;
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; t += dt;
    if (current) { current.rotation.y = t * spin + current.userData.yaw; current.position.y = current.userData.base + Math.sin(t * 2.4) * 0.04 * current.userData.size; }
    if (onFrame) onFrame(dt, t);
    renderer.render(scene, camera);
  }
  return {
    /**
     * el 안에 object 를 보여 준다. object 는 그대로 쓴다 (돌려받지 않는다). 크기에 맞춰 카메라를 맞춘다.
     * turn: 도는 빠르기(라디안/초), yaw: 처음 방향, frame(dt, t): 매 프레임 부른다 (물건을 따로 움직일 때), zoom: 카메라 거리(물건 크기의 배수)
     * @returns {boolean} 보여 줄 수 있었는가 (WebGL 을 못 쓰면 false)
     */
    show(el, object, { tilt = 0.25, turn = 1.3, yaw = 0, frame: tick = null, zoom = 2.6 } = {}) {
      if (!setup()) return false;
      this.hide();
      holder = el; spin = turn; onFrame = tick;      // (frame 은 아래 그리기 함수의 이름이라 tick 으로 받는다)
      const size = Math.max(10, Math.round(el.clientWidth || 160));
      renderer.setSize(size, size, false);
      renderer.domElement.style.width = renderer.domElement.style.height = size + 'px';
      el.append(renderer.domElement);
      // 물건을 가운데에 놓고 크기에 맞춰 카메라를 물린다
      const pivot = new THREE.Group(), inner = new THREE.Group(); inner.add(object); pivot.add(inner);
      const box = new THREE.Box3().setFromObject(object), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      object.position.sub(c);
      inner.rotation.x = tilt;
      const r = Math.max(s.x, s.y, s.z) || 1;
      pivot.userData.base = 0; pivot.userData.size = r; pivot.userData.yaw = yaw;
      scene.add(pivot); current = pivot;
      camera.position.set(0, r * 0.25, r * zoom); camera.lookAt(0, 0, 0); camera.near = r * 0.05; camera.far = r * 20; camera.updateProjectionMatrix();
      t = 0; last = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
      return true;
    },
    hide() {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (current) { scene.remove(current); current.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); current = null; }
      if (renderer && renderer.domElement.parentNode) renderer.domElement.remove();
      holder = null; onFrame = null;
    },
    get showing() { return !!current; },
    /** 물건 하나를 작은 그림(PNG 주소)으로 (옷장의 칸에 쓴다). WebGL 을 못 쓰면 null */
    snapshot(object, size = 112, { tilt = 0.2, yaw = 0.6 } = {}) {
      try {
        if (!snap) {
          snap = { r: new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }), scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(30, 1, 0.01, 50) };
          snap.r.outputColorSpace = THREE.SRGBColorSpace;
          snap.scene.add(new THREE.HemisphereLight('#ffffff', '#b9d3ee', 2.1));
          const sun = new THREE.DirectionalLight('#fff4e0', 2.2); sun.position.set(2, 3, 4); snap.scene.add(sun);
        }
        snap.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); snap.r.setSize(size, size, false);
        const g = new THREE.Group(); g.add(object); g.rotation.set(tilt, yaw, 0); snap.scene.add(g);
        const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()), r = Math.max(s.x, s.y, s.z) || 1;
        snap.cam.position.set(c.x, c.y + r * 0.2, c.z + r * 2.3); snap.cam.lookAt(c); snap.cam.near = r * 0.05; snap.cam.far = r * 20; snap.cam.updateProjectionMatrix();
        snap.r.render(snap.scene, snap.cam);
        const url = snap.r.domElement.toDataURL('image/png');
        snap.scene.remove(g); g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
        return url;
      } catch { return null; }
    },
  };
}
