import {
  AmbientLight,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  AdditiveBlending
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { geoContains, geoEquirectangular, geoPath } from 'd3-geo';
import type { CountryShape } from './geo';
import { BORDER_COLOR, NO_DATA_COLOR, OCEAN_COLOR, rampColor } from './theme';

export interface MarkerPoint {
  id: string;
  lat: number;
  lon: number;
}

export interface GlobeOptions {
  container: HTMLElement;
  shapes: CountryShape[];
  /** Tint per country code, 0..1. Missing = no data. */
  tint: Map<string, number>;
}

export interface HoverEvent {
  shape: CountryShape | null;
  clientX: number;
  clientY: number;
}

const BASE_DISTANCE = 3.2;
const MIN_DISTANCE = 1.25;
const MAX_DISTANCE = 6;
const MARKER_RADIUS = 0.008;
const MARKER_COLOR = '#ffffff';
const MARKER_ACTIVE_COLOR = '#ff6b4a';
const MARKER_HALO_COLOR = '#101a3a';

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Lat/lon in degrees → point on the unit sphere (matches three's SphereGeometry UVs). */
export const latLonToVector3 = (lat: number, lon: number, radius = 1): Vector3 => {
  const phi = MathUtils.degToRad(lat);
  const lambda = MathUtils.degToRad(lon);

  return new Vector3(
    radius * Math.cos(phi) * Math.cos(lambda),
    radius * Math.sin(phi),
    -radius * Math.cos(phi) * Math.sin(lambda)
  );
};

const makeCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

interface Fly {
  startedAt: number;
  duration: number;
  fromDir: Vector3;
  fromDistance: number;
  rotation: Quaternion;
  toDistance: number;
}

export class Globe {
  onHover: (event: HoverEvent) => void = () => undefined;
  onSelect: (shape: CountryShape) => void = () => undefined;

  private readonly container: HTMLElement;
  private readonly shapes: CountryShape[];
  private readonly byCode = new Map<string, CountryShape>();

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(45, 1, 0.1, 100);
  private readonly controls: OrbitControls;
  private readonly sphere: Mesh;
  private readonly raycaster = new Raycaster();

  private readonly projection = geoEquirectangular();
  private readonly idCanvas = makeCanvas(2048, 1024);
  private readonly idContext: CanvasRenderingContext2D;
  private readonly overlayCanvas = makeCanvas(4096, 2048);
  private readonly overlayContext: CanvasRenderingContext2D;
  private readonly overlayTexture: CanvasTexture;

  private hovered: CountryShape | null = null;
  private selected: CountryShape | null = null;

  private markers: InstancedMesh | null = null;
  private markerHalos: InstancedMesh | null = null;
  private markerPoints: MarkerPoint[] = [];
  private activeMarker: string | null = null;
  private markerScale = 1;

  private fly: Fly | null = null;
  private insets = { right: 0, bottom: 0 };
  private downAt: { x: number; y: number; time: number } | null = null;
  private pendingMove: PointerEvent | null = null;
  private readonly resizeObserver: ResizeObserver;

  constructor({ container, shapes, tint }: GlobeOptions) {
    this.container = container;
    this.shapes = shapes;

    for (const shape of shapes) {
      if (shape.code) this.byCode.set(shape.code, shape);
    }

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.append(this.renderer.domElement);

    const textureSize = Math.min(this.renderer.capabilities.maxTextureSize, 4096);
    const colorCanvas = makeCanvas(textureSize, textureSize / 2);

    this.projection.scale(colorCanvas.width / (2 * Math.PI)).translate([colorCanvas.width / 2, colorCanvas.height / 2]);

    this.drawColorMap(colorCanvas, tint);

    const idContext = this.idCanvas.getContext('2d', { willReadFrequently: true });
    const overlayContext = this.overlayCanvas.getContext('2d');

    if (!idContext || !overlayContext) throw new Error('Canvas is not supported.');

    this.idContext = idContext;
    this.overlayContext = overlayContext;
    this.drawIdMap();

    const colorTexture = new CanvasTexture(colorCanvas);
    colorTexture.colorSpace = SRGBColorSpace;
    colorTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.overlayTexture = new CanvasTexture(this.overlayCanvas);
    this.overlayTexture.colorSpace = SRGBColorSpace;

    this.sphere = new Mesh(
      new SphereGeometry(1, 128, 64),
      new MeshStandardMaterial({ map: colorTexture, roughness: 0.9, metalness: 0 })
    );
    this.scene.add(this.sphere);

    const overlay = new Mesh(
      new SphereGeometry(1.0015, 96, 48),
      new MeshBasicMaterial({ map: this.overlayTexture, transparent: true, depthWrite: false })
    );
    this.scene.add(overlay);

    this.scene.add(this.buildAtmosphere(), this.buildStars());

    // Soft ambient plus a headlight so the side facing the viewer is always lit.
    this.scene.add(new AmbientLight(0xffffff, 1.6));
    const headlight = new DirectionalLight(0xffffff, 1.8);
    headlight.position.set(2, 1.5, 3);
    this.camera.add(headlight);
    this.scene.add(this.camera);

    this.camera.position.copy(latLonToVector3(14, 121, BASE_DISTANCE));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = MIN_DISTANCE;
    this.controls.maxDistance = MAX_DISTANCE;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.7;
    this.controls.autoRotate = !prefersReducedMotion();
    this.controls.autoRotateSpeed = 0.45;
    this.controls.addEventListener('start', () => {
      this.fly = null;
      this.setAutoRotate(false);
    });

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);
    document.addEventListener('visibilitychange', this.handleVisibility);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.renderer.setAnimationLoop(this.render);
  }

  // ------------------------------------------------------------ public API

  get autoRotate(): boolean {
    return this.controls.autoRotate;
  }

  setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled && !prefersReducedMotion();
    this.container.dispatchEvent(new CustomEvent('rotatechange', { detail: this.controls.autoRotate }));
  }

  /** Reserve screen space covered by UI so the globe centres in what is left. */
  setInsets(right: number, bottom: number): void {
    this.insets = { right, bottom };
    this.applyViewOffset();
  }

  hasShape(code: string): boolean {
    return this.byCode.has(code);
  }

  /** Highlight a country and (optionally) fly to it. Pass null to clear. */
  select(code: string | null, fly = true): void {
    const shape = code ? (this.byCode.get(code) ?? null) : null;

    this.selected = shape;
    this.drawOverlay();

    if (shape && fly) {
      this.flyTo(shape.centroid[1], shape.centroid[0], this.distanceFor(shape.radius));
    }
  }

  setMarkers(points: MarkerPoint[]): void {
    this.clearMarkers();
    this.markerPoints = points;
    this.activeMarker = null;

    if (points.length === 0) return;

    const mesh = new InstancedMesh(
      new SphereGeometry(MARKER_RADIUS, 14, 10),
      new MeshBasicMaterial(),
      points.length
    );

    // Indigo halo behind each dot so markers read on coral, gold and periwinkle land.
    const halos = new InstancedMesh(
      new SphereGeometry(MARKER_RADIUS * 1.7, 14, 10),
      new MeshBasicMaterial({ color: MARKER_HALO_COLOR }),
      points.length
    );

    this.markers = mesh;
    this.markerHalos = halos;
    this.scene.add(halos, mesh);
    this.paintMarkers();
  }

  /** Highlight one marker and turn the globe towards it. */
  focusMarker(id: string): void {
    const point = this.markerPoints.find((item) => item.id === id);

    if (!point) return;

    this.activeMarker = id;
    this.paintMarkers();
    this.flyTo(point.lat, point.lon, Math.min(this.camera.position.length(), 2));
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------ rendering

  private readonly render = (): void => {
    if (this.fly) this.stepFly();

    this.controls.update();
    this.rescaleMarkers();
    this.renderer.render(this.scene, this.camera);
  };

  private readonly handleVisibility = (): void => {
    this.renderer.setAnimationLoop(document.hidden ? null : this.render);
  };

  private resize(): void {
    const { clientWidth, clientHeight } = this.container;

    if (clientWidth === 0 || clientHeight === 0) return;

    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    this.applyViewOffset();
  }

  private applyViewOffset(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    if (width === 0 || height === 0) return;

    const { right, bottom } = this.insets;

    if (right === 0 && bottom === 0) {
      this.camera.clearViewOffset();
    } else {
      // A positive offset slides the scene left/up by half the covered space.
      this.camera.setViewOffset(width, height, right / 2, bottom / 2, width, height);
    }

    this.camera.updateProjectionMatrix();
  }

  // -------------------------------------------------------------- textures

  private drawColorMap(canvas: HTMLCanvasElement, tint: Map<string, number>): void {
    const context = canvas.getContext('2d');

    if (!context) throw new Error('Canvas is not supported.');

    const path = geoPath(this.projection, context);

    context.fillStyle = OCEAN_COLOR;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.lineJoin = 'round';
    context.lineWidth = Math.max(1, canvas.width / 4096);
    context.strokeStyle = BORDER_COLOR;

    for (const shape of this.shapes) {
      const value = shape.code ? tint.get(shape.code) : undefined;

      context.fillStyle = value === undefined ? NO_DATA_COLOR : rampColor(value);
      context.beginPath();
      path(shape.feature);
      context.fill();
      context.stroke();
    }
  }

  private drawIdMap(): void {
    const { width, height } = this.idCanvas;
    const projection = geoEquirectangular()
      .scale(width / (2 * Math.PI))
      .translate([width / 2, height / 2]);
    const path = geoPath(projection, this.idContext);

    this.idContext.fillStyle = '#000';
    this.idContext.fillRect(0, 0, width, height);

    for (const shape of this.shapes) {
      const value = shape.index + 1;

      this.idContext.fillStyle = `rgb(${value & 255}, ${(value >> 8) & 255}, 0)`;
      this.idContext.beginPath();
      path(shape.feature);
      this.idContext.fill();
    }
  }

  private drawOverlay(): void {
    const context = this.overlayContext;
    const { width, height } = this.overlayCanvas;
    const projection = geoEquirectangular()
      .scale(width / (2 * Math.PI))
      .translate([width / 2, height / 2]);
    const path = geoPath(projection, context);

    context.clearRect(0, 0, width, height);

    const paint = (shape: CountryShape | null, fill: string, stroke: string, line: number): void => {
      if (!shape) return;

      context.beginPath();
      path(shape.feature);
      context.fillStyle = fill;
      context.fill();
      context.lineWidth = line;
      context.strokeStyle = stroke;
      context.stroke();
    };

    if (this.hovered && this.hovered !== this.selected) {
      paint(this.hovered, 'rgba(255, 255, 255, 0.14)', 'rgba(255, 255, 255, 0.6)', 1.5);
    }

    paint(this.selected, 'rgba(255, 255, 255, 0.2)', '#ffffff', 2);

    this.overlayTexture.needsUpdate = true;
  }

  private buildAtmosphere(): Mesh {
    return new Mesh(
      new SphereGeometry(1.12, 64, 32),
      new ShaderMaterial({
        side: BackSide,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
            gl_FragColor = vec4(0.42, 0.5, 0.85, 1.0) * clamp(intensity, 0.0, 1.0);
          }`
      })
    );
  }

  private buildStars(): Points {
    const count = 1400;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const direction = new Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      )
        .normalize()
        .multiplyScalar(30 + Math.random() * 20);

      positions.set([direction.x, direction.y, direction.z], i * 3);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

    return new Points(
      geometry,
      new PointsMaterial({ color: 0xc9d0ee, size: 0.12, sizeAttenuation: true, transparent: true, opacity: 0.7 })
    );
  }

  // --------------------------------------------------------------- markers

  private clearMarkers(): void {
    if (!this.markers) return;

    for (const mesh of [this.markers, this.markerHalos]) {
      if (!mesh) continue;

      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
      mesh.dispose();
    }

    this.markers = null;
    this.markerHalos = null;
  }

  /** Keep markers a similar on-screen size whether zoomed in or out. */
  private rescaleMarkers(): void {
    if (!this.markers) return;

    const scale = MathUtils.clamp((this.camera.position.length() - 0.9) * 0.55, 0.3, 1.4);

    if (Math.abs(scale - this.markerScale) / this.markerScale > 0.04) {
      this.markerScale = scale;
      this.paintMarkers();
    }
  }

  private paintMarkers(): void {
    if (!this.markers) return;

    const matrix = new Matrix4();
    const normal = new Color(MARKER_COLOR);
    const active = new Color(MARKER_ACTIVE_COLOR);

    this.markerPoints.forEach((point, index) => {
      const isActive = point.id === this.activeMarker;
      const scale = (isActive ? 1.9 : 1) * this.markerScale;

      const quaternion = new Quaternion();
      const size = new Vector3(scale, scale, scale);

      // The dot sits above the halo so the larger halo sphere does not hide it.
      matrix.compose(latLonToVector3(point.lat, point.lon, 1.004), quaternion, size);
      this.markerHalos?.setMatrixAt(index, matrix);
      matrix.compose(latLonToVector3(point.lat, point.lon, 1.014), quaternion, size);
      this.markers?.setMatrixAt(index, matrix);
      this.markers?.setColorAt(index, isActive ? active : normal);
    });

    if (this.markerHalos) this.markerHalos.instanceMatrix.needsUpdate = true;
    this.markers.instanceMatrix.needsUpdate = true;
    if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- camera

  private distanceFor(radius: number): number {
    return MathUtils.clamp(1.5 + radius * 2, 1.9, 3.8);
  }

  private flyTo(lat: number, lon: number, distance: number): void {
    const target = latLonToVector3(lat, lon).normalize();
    const toDistance = MathUtils.clamp(distance, MIN_DISTANCE, MAX_DISTANCE);

    this.setAutoRotate(false);

    if (prefersReducedMotion()) {
      this.fly = null;
      this.camera.position.copy(target.multiplyScalar(toDistance));
      return;
    }

    const fromDir = this.camera.position.clone().normalize();

    this.fly = {
      startedAt: performance.now(),
      duration: 900,
      fromDir,
      fromDistance: this.camera.position.length(),
      rotation: new Quaternion().setFromUnitVectors(fromDir, target),
      toDistance
    };
  }

  private stepFly(): void {
    const fly = this.fly;

    if (!fly) return;

    const progress = Math.min(1, (performance.now() - fly.startedAt) / fly.duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const step = new Quaternion().slerp(fly.rotation, eased);
    const distance = MathUtils.lerp(fly.fromDistance, fly.toDistance, eased);

    this.camera.position.copy(fly.fromDir.clone().applyQuaternion(step).multiplyScalar(distance));

    if (progress >= 1) this.fly = null;
  }

  // --------------------------------------------------------------- picking

  private pick(clientX: number, clientY: number): CountryShape | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(ndc, this.camera);

    const hit = this.raycaster.intersectObject(this.sphere, false)[0];

    if (!hit) return null;

    // The globe never rotates, so world space equals object space.
    const lat = MathUtils.radToDeg(Math.asin(MathUtils.clamp(hit.point.y, -1, 1)));
    const lon = MathUtils.radToDeg(Math.atan2(-hit.point.z, hit.point.x));
    return this.shapeAt(lon, lat);
  }

  /**
   * The id-map gives a candidate in O(1). Edge pixels are anti-aliased blends,
   * so every candidate is verified with an exact point-in-polygon test.
   */
  private shapeAt(lon: number, lat: number): CountryShape | null {
    const { width, height } = this.idCanvas;
    const px = Math.floor(((lon + 180) / 360) * width);
    const py = Math.floor(((90 - lat) / 180) * height);

    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const x = MathUtils.clamp(px + dx, 0, width - 1);
      const y = MathUtils.clamp(py + dy, 0, height - 1);
      const [r, g] = this.idContext.getImageData(x, y, 1, 1).data;
      const index = (r | (g << 8)) - 1;
      const candidate = index >= 0 ? this.shapes[index] : undefined;

      if (candidate && geoContains(candidate.feature, [lon, lat])) return candidate;
    }

    return null;
  }

  private setHovered(shape: CountryShape | null): void {
    if (shape === this.hovered) return;

    this.hovered = shape;
    this.drawOverlay();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.downAt = { x: event.clientX, y: event.clientY, time: performance.now() };
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const down = this.downAt;

    this.downAt = null;

    if (!down) return;

    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);

    // A drag rotates the globe; only a near-stationary press is a click.
    if (moved > 6 || performance.now() - down.time > 600) return;

    const shape = this.pick(event.clientX, event.clientY);

    if (shape?.code) this.onSelect(shape);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || event.buttons !== 0) return;

    // Coalesce moves to one pick per frame.
    const idle = this.pendingMove === null;

    this.pendingMove = event;

    if (!idle) return;

    requestAnimationFrame(() => {
      const move = this.pendingMove;

      this.pendingMove = null;

      if (!move) return;

      const shape = this.pick(move.clientX, move.clientY);
      const selectable = shape?.code ? shape : null;

      this.setHovered(selectable);
      this.renderer.domElement.classList.toggle('is-over-country', selectable !== null);
      this.onHover({ shape: selectable, clientX: move.clientX, clientY: move.clientY });
    });
  };

  private readonly handlePointerLeave = (): void => {
    this.pendingMove = null;
    this.setHovered(null);
    this.renderer.domElement.classList.remove('is-over-country');
    this.onHover({ shape: null, clientX: 0, clientY: 0 });
  };
}
