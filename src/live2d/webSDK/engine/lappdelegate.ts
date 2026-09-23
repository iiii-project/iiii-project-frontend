// @ts-nocheck -- vendored Live2D Cubism SDK code, not held to this project's strict tsconfig
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismFramework, Option } from '@framework/live2dcubismframework';

import * as LAppDefine from './lappdefine';
import { LAppLive2DManager } from './lapplive2dmanager';
import { LAppPal } from './lapppal';
import { LAppTextureManager } from './lapptexturemanager';
import { LAppView } from './lappview';
import { canvas, gl } from './lappglmanager';
import { getCappedDevicePixelRatio } from '@/utils/device';
import { getPerformanceProfile } from '@/utils/performance';

export let s_instance: LAppDelegate | null = null;
export let frameBuffer: WebGLFramebuffer | null = null;



/**
 * アプリケーションクラス。
 * Cubism SDKの管理を行う。
 * 
 * 应用程序类。
 * 管理Cubism SDK。
 * 
 */
export class LAppDelegate {
  /**
   * クラスのインスタンス（シングルトン）を返す。
   * インスタンスが生成されていない場合は内部でインスタンスを生成する。
   * 
   * 返回类的实例（单例）。
   * 如果尚未创建实例，则在内部创建实例。
   *
   * @return クラスのインスタンス
   */
  public static getInstance(): LAppDelegate {
    if (s_instance == null) {
      s_instance = new LAppDelegate();
    }

    return s_instance;
  }

  /**
   * クラスのインスタンス（シングルトン）を解放する。
   * 
   * 释放类的实例（单例）。
   * 
   */
  public static releaseInstance(): void {
    if (s_instance != null) {
      s_instance.release();
    }

    s_instance = null;
  }

  /**
   * Initialize the application.
   */
  public initialize(): boolean {
    // Comment out the following code since canvas already exists in DOM
    // let parent = document.getElementById('live2d');
    // if (parent) {
    //   parent.appendChild(canvas!);
    // } else {
    //   document.body.appendChild(canvas!);
    // }

    if (LAppDefine.CanvasSize === 'auto') {
      this._resizeCanvas();
    } else {
      canvas!.width = LAppDefine.CanvasSize.width;
      canvas!.height = LAppDefine.CanvasSize.height;
    }

    if (!frameBuffer) {
      frameBuffer = gl!.getParameter(gl!.FRAMEBUFFER_BINDING);
    }

    // 透過設定
    // 透明设置
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);
    gl!.enable(gl!.DEPTH_TEST);
    gl!.depthFunc(gl!.LEQUAL);
    gl!.clearDepth(1.0);
    gl!.clearColor(0.0, 0.0, 0.0, 1.0);

    // 模型切換會重新初始化 manager，但 canvas / delegate 仍然存在。
    // 事件只綁一次，避免每換一次模型就多一組 handler。
    if (!this._inputEventsBound) {
      const supportTouch: boolean = 'ontouchend' in canvas!;
      if (supportTouch) {
        canvas!.addEventListener('touchstart', onTouchBegan, { passive: true });
        canvas!.addEventListener('touchmove', onTouchMoved, { passive: true });
        canvas!.addEventListener('touchend', onTouchEnded, { passive: true });
        canvas!.addEventListener('touchcancel', onTouchCancel, { passive: true });
      } else {
        canvas!.addEventListener('mousedown', onClickBegan, { passive: true });
        canvas!.addEventListener('mousemove', onMouseMoved, { passive: true });
        canvas!.addEventListener('mouseup', onClickEnded, { passive: true });
      }
      this._inputEventsBound = true;
    }

    // AppViewの初期化
    this._view!.initialize();

    // Cubism SDKの初期化
    this.initializeCubism();

    return true;
  }

  /**
   * Resize canvas and re-initialize view.
   */
  public onResize(): void {
    this._resizeCanvas();
    
    // Ensure view is properly initialized
    if (this._view && canvas) {
      this._view.initialize();
      this._view.initializeSprite();
      
      // Try to get and center the model
      const manager = LAppLive2DManager.getInstance();
      if (manager) {
        const model = manager.getModel(0);
        if (model) {
          // Keep model centered in canvas
          const width = canvas!.width;
          const height = canvas!.height;
          if (width > 0 && height > 0) {
            // @ts-ignore
            if (model.setPosition) {
              // @ts-ignore
              model.setPosition(width / 2, height / 2);
            }
          }
        }
      }
    }
  }

  /**
   * 解放する。
   */
  public release(): void {
    this._isEnd = true;
    this._isRunning = false;
    if (this._animationFrame !== null) {
      cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }

    if (this._inputEventsBound && canvas) {
      if ('ontouchend' in canvas) {
        canvas.removeEventListener('touchstart', onTouchBegan);
        canvas.removeEventListener('touchmove', onTouchMoved);
        canvas.removeEventListener('touchend', onTouchEnded);
        canvas.removeEventListener('touchcancel', onTouchCancel);
      } else {
        canvas.removeEventListener('mousedown', onClickBegan);
        canvas.removeEventListener('mousemove', onMouseMoved);
        canvas.removeEventListener('mouseup', onClickEnded);
      }
      this._inputEventsBound = false;
    }

    this._textureManager!.release();
    this._textureManager = null;

    this._view!.release();
    this._view = null;

    // リソースを解放
    LAppLive2DManager.releaseInstance();

    // Cubism SDKの解放
    CubismFramework.dispose();
  }

  /**
   * 実行処理。
   * 执行处理。
   */
  public run(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    const targetFrameRate = getPerformanceProfile().live2dFps;
    // メインループ
    // 主循环
    const loop = (): void => {
      this._animationFrame = null;
      // インスタンスの有無の確認
      // 检查实例是否存在
      if (s_instance == null) {
        return;
      }

      // 分頁隱藏時不要讓 rAF 持續自我排程。部分舊瀏覽器雖然會節流 rAF，
      // 仍會保留 callback 與 JS 喚醒成本；回到前景時由 visibility handler 重啟。
      if (document.visibilityState === 'hidden') return;

      // 時間更新
       if (LAppDefine.ENABLE_LIMITED_FRAME_RATE) {
         LAppPal.updateTime(false);
         if (LAppPal.getDeltaTime() < 1 / targetFrameRate) {
            this._animationFrame = requestAnimationFrame(loop);
            return;
         }
       }

      LAppPal.updateTime(true);


        // カラーバッファや深度バッファをクリアする
      // 清除颜色缓冲区和深度缓冲区
      // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl!.clear(gl!.DEPTH_BUFFER_BIT);

       // 描画更新
       this._view!.render();

      // ループのために再帰呼び出し
      // 递归调用以进行循环
       this._animationFrame = requestAnimationFrame(loop);
    };
    this._visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        if (this._animationFrame !== null) {
          cancelAnimationFrame(this._animationFrame);
          this._animationFrame = null;
        }
      } else if (this._animationFrame === null && s_instance === this && !this._isEnd) {
        this._animationFrame = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler, { passive: true });
    this._animationFrame = requestAnimationFrame(loop);
  }

  /**
   * シェーダーを登録する。
   * 注册着色器。
   */
  public createShader(): WebGLProgram | null {
    // バーテックスシェーダーのコンパイル
    // 编译顶点着色器
    const vertexShaderId = gl!.createShader(gl!.VERTEX_SHADER);

    if (vertexShaderId == null) {
      LAppPal.printMessage('failed to create vertexShader');
      return null;
    }

    const vertexShader: string =
      'precision mediump float;' +
      'attribute vec3 position;' +
      'attribute vec2 uv;' +
      'varying vec2 vuv;' +
      'void main(void)' +
      '{' +
      '   gl_Position = vec4(position, 1.0);' +
      '   vuv = uv;' +
      '}';

    gl!.shaderSource(vertexShaderId, vertexShader);
    gl!.compileShader(vertexShaderId);

    // フラグメントシェーダのコンパイル
    const fragmentShaderId = gl!.createShader(gl!.FRAGMENT_SHADER);

    if (fragmentShaderId == null) {
      LAppPal.printMessage('failed to create fragmentShader');
      return null;
    }

    const fragmentShader: string =
      'precision mediump float;' +
      'varying vec2 vuv;' +
      'uniform sampler2D texture;' +
      'void main(void)' +
      '{' +
      '   gl_FragColor = texture2D(texture, vuv);' +
      '}';

    gl!.shaderSource(fragmentShaderId, fragmentShader);
    gl!.compileShader(fragmentShaderId);

    // プログラムオブジェクトの作成
    // 创建程序对象
    const programId = gl!.createProgram();
    gl!.attachShader(programId!, vertexShaderId);
    gl!.attachShader(programId!, fragmentShaderId);

    gl!.deleteShader(vertexShaderId);
    gl!.deleteShader(fragmentShaderId);

    // リンク
    // 链接
    gl!.linkProgram(programId!);

    gl!.useProgram(programId);

    return programId;
  }

  /**
   * View情報を取得する。
   */
  public getView(): LAppView | null {
    return this._view;
  }

  public getTextureManager(): LAppTextureManager | null {
    return this._textureManager;
  }

  /**
   * コンストラクタ
   * 构造函数
   */
  constructor() {
    this._captured = false;
    this._mouseX = 0.0;
    this._mouseY = 0.0;
    this._isEnd = false;
    this._inputEventsBound = false;
    this._animationFrame = null;
    this._visibilityHandler = null;
    this._isRunning = false;

    this._cubismOption = new Option();
    this._view = new LAppView();
    this._textureManager = new LAppTextureManager();
  }

  /**
   * Cubism SDKの初期化
   */
  public initializeCubism(): void {
    // setup cubism
    this._cubismOption.logFunction = LAppPal.printMessage;
    this._cubismOption.loggingLevel = LAppDefine.CubismLoggingLevel;
    CubismFramework.startUp(this._cubismOption);

    // initialize cubism
    CubismFramework.initialize();

    // load model
    LAppLive2DManager.getInstance();

    LAppPal.updateTime();

    this._view!.initializeSprite();
  }

  /**
   * Resize the canvas to fill the screen.
   */
  private _resizeCanvas(): void {
    if (!canvas) {
      console.warn("Canvas is null, skipping resize");
      return;
    }
    const dpr = getCappedDevicePixelRatio();
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    if (gl) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
  }

  _cubismOption: Option; // Cubism SDK Option
  _view: LAppView | null; // View情報  // 视图信息
  _captured: boolean; // クリックしているか // 是否点击
  _mouseX: number; // マウスX座標 // 鼠标X坐标
  _mouseY: number; // マウスY座標 // 鼠标Y坐标
  _isEnd: boolean; // APP終了しているか // APP是否已结束
  _textureManager: LAppTextureManager | null; // テクスチャマネージャー // 纹理管理器
  _inputEventsBound: boolean;
  _animationFrame: number | null;
  _visibilityHandler: (() => void) | null;
  _isRunning: boolean;
}

/**
 * クリックしたときに呼ばれる。
 * 当单击时调用。
 */
function onClickBegan(e: MouseEvent): void {
  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage('view notfound');
    return;
  }
  LAppDelegate.getInstance()._captured = true;

  const posX: number = e.pageX;
  const posY: number = e.pageY;

  LAppDelegate.getInstance()._view!.onTouchesBegan(posX, posY);
}

/**
 * マウスポインタが動いたら呼ばれる。
 */
function onMouseMoved(e: MouseEvent): void {
  if (!LAppDelegate.getInstance()._captured) {
    return;
  }

  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage('view notfound');
    return;
  }

  const rect = (e.target as Element).getBoundingClientRect();
  const posX: number = e.clientX - rect.left;
  const posY: number = e.clientY - rect.top;

  LAppDelegate.getInstance()._view!.onTouchesMoved(posX, posY);
}

/**
 * クリックが終了したら呼ばれる。
 */
function onClickEnded(e: MouseEvent): void {
  LAppDelegate.getInstance()._captured = false;
  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage('view notfound');
    return;
  }

  const rect = (e.target as Element).getBoundingClientRect();
  const posX: number = e.clientX - rect.left;
  const posY: number = e.clientY - rect.top;

  LAppDelegate.getInstance()._view!.onTouchesEnded(posX, posY);
}

/**
 * タッチしたときに呼ばれる。
 */
function onTouchBegan(e: TouchEvent): void {
  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage('view notfound');
    return;
  }

  LAppDelegate.getInstance()._captured = true;

  const posX = e.changedTouches[0].pageX;
  const posY = e.changedTouches[0].pageY;

  LAppDelegate.getInstance()._view!.onTouchesBegan(posX, posY);
}

/**
 * スワイプすると呼ばれる。
 */
function onTouchMoved(e: TouchEvent): void {
  if (!LAppDelegate.getInstance()._captured) {
    return;
  }

  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage('view notfound');
    return;
  }

  const rect = (e.target as Element).getBoundingClientRect();

  const posX = e.changedTouches[0].clientX - rect.left;
  const posY = e.changedTouches[0].clientY - rect.top;

  LAppDelegate.getInstance()._view!.onTouchesMoved(posX, posY);
}

/**
 * タッチが終了したら呼ばれる。
 */
function onTouchEnded(e: TouchEvent): void {
  LAppDelegate.getInstance()._captured = false;

  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage('view notfound');
    return;
  }

  const rect = (e.target as Element).getBoundingClientRect();

  const posX = e.changedTouches[0].clientX - rect.left;
  const posY = e.changedTouches[0].clientY - rect.top;

  LAppDelegate.getInstance()._view!.onTouchesEnded(posX, posY);
}

/**
 * タッチがキャンセルされると呼ばれる。
 */
function onTouchCancel(e: TouchEvent): void {
  LAppDelegate.getInstance()._captured = false;

  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage('view notfound');
    return;
  }

  const rect = (e.target as Element).getBoundingClientRect();

  const posX = e.changedTouches[0].clientX - rect.left;
  const posY = e.changedTouches[0].clientY - rect.top;

  LAppDelegate.getInstance()._view!.onTouchesEnded(posX, posY);
}
