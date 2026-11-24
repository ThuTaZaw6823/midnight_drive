export interface PhotoModeCallbacks {
  onFovChange: (fov: number) => void;
  onExposureChange: (exposure: number) => void;
  onCaptureScreenshot: () => void;
  onResetView: () => void;
  onExit: () => void;
}

/**
 * Compact, unobtrusive Photography Mode overlay bar:
 * - Free camera hints (Drag to rotate · WASD + QE to move · Shift boost)
 * - Live FOV & Exposure sliders
 * - Local PNG Screenshot Capture button
 */
export class PhotoModeUI {
  public readonly element: HTMLDivElement;
  private readonly fovInput: HTMLInputElement;
  private readonly fovVal: HTMLElement;
  private readonly expInput: HTMLInputElement;
  private readonly expVal: HTMLElement;

  constructor(private readonly callbacks: PhotoModeCallbacks) {
    this.element = document.createElement('div');
    this.element.className = 'photo-bar hidden';
    this.element.innerHTML = `
      <div class="photo-header">
        <span class="photo-title">PHOTO MODE</span>
        <span class="photo-hints">Drag: Rotate · WASD/QE: Move · Shift: Fast · Scroll: FOV</span>
      </div>
      <div class="photo-controls">
        <label class="photo-slider">
          <span>FOV <strong id="photo-fov-val">54°</strong></span>
          <input id="photo-fov" type="range" min="24" max="92" step="1" value="54" />
        </label>
        <label class="photo-slider">
          <span>Exposure <strong id="photo-exp-val">1.10</strong></span>
          <input id="photo-exp" type="range" min="0.7" max="1.6" step="0.05" value="1.1" />
        </label>
        <button type="button" class="action-btn primary" id="photo-capture">Capture PNG</button>
        <button type="button" class="action-btn" id="photo-reset">Reset</button>
        <button type="button" class="action-btn" id="photo-exit">Exit (P)</button>
      </div>
    `;

    this.fovInput = this.element.querySelector('#photo-fov') as HTMLInputElement;
    this.fovVal = this.element.querySelector('#photo-fov-val')!;
    this.expInput = this.element.querySelector('#photo-exp') as HTMLInputElement;
    this.expVal = this.element.querySelector('#photo-exp-val')!;

    this.fovInput.addEventListener('input', () => {
      const v = parseFloat(this.fovInput.value);
      this.fovVal.textContent = `${Math.round(v)}°`;
      this.callbacks.onFovChange(v);
    });

    this.expInput.addEventListener('input', () => {
      const v = parseFloat(this.expInput.value);
      this.expVal.textContent = v.toFixed(2);
      this.callbacks.onExposureChange(v);
    });

    this.element.querySelector('#photo-capture')!.addEventListener('click', () => {
      this.callbacks.onCaptureScreenshot();
    });
    this.element.querySelector('#photo-reset')!.addEventListener('click', () => {
      this.callbacks.onResetView();
    });
    this.element.querySelector('#photo-exit')!.addEventListener('click', () => {
      this.callbacks.onExit();
    });
  }

  public show(fov: number, exposure: number): void {
    this.fovInput.value = String(Math.round(fov));
    this.fovVal.textContent = `${Math.round(fov)}°`;
    this.expInput.value = String(exposure);
    this.expVal.textContent = exposure.toFixed(2);
    this.element.classList.remove('hidden');
  }

  public syncFov(fov: number): void {
    this.fovInput.value = String(Math.round(fov));
    this.fovVal.textContent = `${Math.round(fov)}°`;
  }

  public hide(): void {
    this.element.classList.add('hidden');
  }
}
