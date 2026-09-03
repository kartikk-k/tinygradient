import type { GradientState } from "./gl-engine";
import { GLSL_UTILITIES, GLSL_WARP_FUNCTIONS, GLSL_EFFECT_FUNCTIONS } from "./shaders";

const DATA_URL_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function sanitizeDataURL(url: string | null): string {
  if (!url || !DATA_URL_RE.test(url)) {
    throw new Error("Invalid data URL");
  }
  return url;
}

export function buildFragExport(state: GradientState): string {
  return `precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;   // load the baked gradient texture into this sampler
uniform vec2  uTexSize;   // grid resolution in texels (set to your texture size)
uniform float uTime;      // seconds
uniform float uFlow;      // ${state.flow.toFixed(2)} suggested  (0 = static)
uniform float uSpeed;     // ${state.speed.toFixed(2)} suggested
uniform float uScale;     // ${state.scale.toFixed(1)} suggested
uniform float uQuality;   // ${state.quality.toFixed(2)} suggested  (0 = bilinear, 1 = bicubic + dither)
uniform float uNoise;      // ${state.noise.toFixed(3)} suggested  (0 = none, static grain)
uniform float uNoiseScale;  // ${state.noiseScale.toFixed(1)} suggested  (grain size in px)
uniform float uAnimMode;    // ${state.animMode} (0=none,1=organic,2=hwave,3=vwave,4=pulse,5=swirl,6=breathe,7=drift,8=liquid,9=ripple)
uniform float uHueShift;    // ${state.hueShift.toFixed(2)} hue rotation in radians
uniform float uEffect;      // ${state.effect} (0=none,1=pixelate,2=dots,3=halftone,4=scanlines,5=crosshatch)
uniform float uEffectScale; // ${state.effectScale.toFixed(1)} overlay cell / block size in px
uniform vec2  uResolution;  // canvas resolution in pixels
uniform float uCropMode;    // 0 = stretch, 1 = crop (cover)

${GLSL_UTILITIES}

${GLSL_WARP_FUNCTIONS}

${GLSL_EFFECT_FUNCTIONS}

void main(){
  float t = uTime * uSpeed;
  vec2 baseUV = vUv;
  if(uCropMode > 0.5) baseUV = coverUV(baseUV, uTexSize, uResolution);
  if(uEffect > 0.5 && uEffect < 1.5) baseUV = pixelateUV(baseUV, uResolution, uEffectScale);
  vec2 uv = warp(baseUV, t);
  vec3 bilinear = texture2D(uTex, uv).rgb;
  vec3 bicubic  = textureBicubic(uTex, uv, uTexSize);
  vec3 col = mix(bilinear, bicubic, uQuality);
  vec2 dp = gl_FragCoord.xy + t * 60.0;
  float d = hash(dp) + hash(dp + 7.31) - 1.0;
  col += d * (uQuality / 255.0);
  if(uNoise > 0.0){
    vec2 np = floor(gl_FragCoord.xy / uNoiseScale);
    float n = hash(np) * 2.0 - 1.0;
    col += n * uNoise;
  }
  if(uHueShift != 0.0) col = hueRotate(col, uHueShift);
  if(uEffect > 1.5) col = applyEffect(col, gl_FragCoord.xy);
  gl_FragColor = vec4(col, 1.0);
}`;
}

export function buildVertExport(): string {
  return `attribute vec2 aPos;
varying vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
}

export function buildStandalone(state: GradientState): string {
  const frag = buildFragExport(state);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Animated gradient shader</title>
<style>html,body{margin:0;height:100%;background:#000}canvas{display:block;width:100vw;height:100vh}</style>
</head><body><canvas id="c"></canvas><script>
const cv=document.getElementById('c'),gl=cv.getContext('webgl');
function fit(){const d=Math.min(devicePixelRatio||1,2);cv.width=innerWidth*d;cv.height=innerHeight*d;gl.viewport(0,0,cv.width,cv.height);draw();}
addEventListener('resize',fit);
const V=\`${buildVertExport()}\`;
const F=\`${frag}\`;
function sh(t,s){const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o;}
const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,V));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,F));gl.linkProgram(p);gl.useProgram(p);
const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
const a=gl.getAttribLocation(p,'aPos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
const tx=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tx);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
const im=new Image();im.onload=()=>{gl.bindTexture(gl.TEXTURE_2D,tx);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);draw();};
im.src="${sanitizeDataURL(state.dataURL)}";
const uT=gl.getUniformLocation(p,'uTime'),uF=gl.getUniformLocation(p,'uFlow'),uS=gl.getUniformLocation(p,'uSpeed'),uC=gl.getUniformLocation(p,'uScale'),uTex=gl.getUniformLocation(p,'uTex'),uTS=gl.getUniformLocation(p,'uTexSize'),uQ=gl.getUniformLocation(p,'uQuality'),uN=gl.getUniformLocation(p,'uNoise'),uNS=gl.getUniformLocation(p,'uNoiseScale'),uAM=gl.getUniformLocation(p,'uAnimMode'),uHS=gl.getUniformLocation(p,'uHueShift'),uEF=gl.getUniformLocation(p,'uEffect'),uES=gl.getUniformLocation(p,'uEffectScale'),uCM=gl.getUniformLocation(p,'uCropMode'),uR=gl.getUniformLocation(p,'uResolution');
const ANIM=${state.animMode > 0},t0=performance.now();
function draw(n){n=n||performance.now();gl.uniform1i(uTex,0);gl.uniform2f(uTS,${state.gridW},${state.gridH});gl.uniform1f(uT,ANIM?(n-t0)/1000:0);gl.uniform1f(uF,${state.flow});gl.uniform1f(uS,${state.speed});gl.uniform1f(uC,${state.scale});gl.uniform1f(uQ,${state.quality});gl.uniform1f(uN,${state.noise});gl.uniform1f(uNS,${state.noiseScale});gl.uniform1f(uAM,${state.animMode});gl.uniform1f(uHS,${state.hueShift});gl.uniform1f(uEF,${state.effect});gl.uniform1f(uES,${state.effectScale});gl.uniform1f(uCM,1);gl.uniform2f(uR,cv.width,cv.height);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
function loop(n){draw(n);if(ANIM)requestAnimationFrame(loop);}
fit();requestAnimationFrame(loop);
<\/script></body></html>`;
}

export function buildReactComponent(state: GradientState): string {
  const frag = buildFragExport(state);
  const vert = buildVertExport();
  return `"use client";

import { useEffect, useRef } from "react";

const VERT = \`${vert}\`;

const FRAG = \`${frag}\`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s) || "shader failed to compile");
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export default function GradientShader({
  className,
  style,
  mode = "crop",
}: {
  className?: string;
  style?: React.CSSProperties;
  mode?: "crop" | "stretch";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // A canvas hands back the same context object every time, so a context
    // that was lost earlier stays lost — bail instead of issuing GL calls
    // that would all quietly return null.
    const ctx = canvas.getContext("webgl", { antialias: true });
    if (!ctx || ctx.isContextLost()) return;
    const gl = ctx;

    const vert = compileShader(gl, gl.VERTEX_SHADER, VERT);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vert || !frag) {
      if (vert) gl.deleteShader(vert);
      if (frag) gl.deleteShader(frag);
      return;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    // The linked program keeps its own copy, so the shader objects are free.
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog) || "program failed to link");
      gl.deleteProgram(prog);
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255])
    );

    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      draw();
    };
    img.src = "${sanitizeDataURL(state.dataURL)}";

    const U = {
      tex: gl.getUniformLocation(prog, "uTex"),
      texSize: gl.getUniformLocation(prog, "uTexSize"),
      time: gl.getUniformLocation(prog, "uTime"),
      flow: gl.getUniformLocation(prog, "uFlow"),
      speed: gl.getUniformLocation(prog, "uSpeed"),
      scale: gl.getUniformLocation(prog, "uScale"),
      quality: gl.getUniformLocation(prog, "uQuality"),
      noise: gl.getUniformLocation(prog, "uNoise"),
      noiseScale: gl.getUniformLocation(prog, "uNoiseScale"),
      animMode: gl.getUniformLocation(prog, "uAnimMode"),
      hueShift: gl.getUniformLocation(prog, "uHueShift"),
      effect: gl.getUniformLocation(prog, "uEffect"),
      effectScale: gl.getUniformLocation(prog, "uEffectScale"),
      cropMode: gl.getUniformLocation(prog, "uCropMode"),
      resolution: gl.getUniformLocation(prog, "uResolution"),
    };

    // animMode 0 is a static gradient — render once instead of running a
    // permanent requestAnimationFrame loop that re-renders an identical frame.
    const animated = ${state.animMode > 0};
    const t0 = performance.now();
    let animId = 0;
    let running = false;
    let disposed = false;

    function draw() {
      if (disposed) return;
      const t = animated ? (performance.now() - t0) / 1000 : 0;
      gl.uniform1i(U.tex, 0);
      gl.uniform2f(U.texSize, ${state.gridW}, ${state.gridH});
      gl.uniform1f(U.time, t);
      gl.uniform1f(U.flow, ${state.flow});
      gl.uniform1f(U.speed, ${state.speed});
      gl.uniform1f(U.scale, ${state.scale});
      gl.uniform1f(U.quality, ${state.quality});
      gl.uniform1f(U.noise, ${state.noise});
      gl.uniform1f(U.noiseScale, ${state.noiseScale});
      gl.uniform1f(U.animMode, ${state.animMode});
      gl.uniform1f(U.hueShift, ${state.hueShift});
      gl.uniform1f(U.effect, ${state.effect});
      gl.uniform1f(U.effectScale, ${state.effectScale});
      gl.uniform1f(U.cropMode, mode === "stretch" ? 0 : 1);
      gl.uniform2f(U.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function loop() {
      if (disposed || !running) return;
      draw();
      animId = requestAnimationFrame(loop);
    }

    function start() {
      if (!animated || running || disposed) return;
      running = true;
      animId = requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(animId);
    }

    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas!.width = Math.round(canvas!.clientWidth * dpr);
      canvas!.height = Math.round(canvas!.clientHeight * dpr);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      draw();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    // Only animate while the canvas is actually on screen.
    const visObserver = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0 }
    );
    visObserver.observe(canvas);

    if (animated) start();
    else draw();

    return () => {
      disposed = true;
      stop();
      resizeObserver.disconnect();
      visObserver.disconnect();
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      // Deliberately NOT calling WEBGL_lose_context.loseContext() here: the
      // canvas would hand the same dead context back to the next effect run
      // (React Strict Mode, Fast Refresh, or a "mode" change), and every GL
      // call on it returns null. Dropping the references is enough.
    };
  }, [mode]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", ...style }}
    />
  );
}
`;
}
