"use client";

import { useEffect, useRef } from "react";
import { GLSL_UTILITIES, GLSL_WARP_FUNCTIONS } from "@/lib/shaders";
import type { CollectionItem } from "@/lib/collection";

const VERT = `attribute vec2 aPos;
varying vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2  uTexSize;
uniform float uTime;
uniform float uFlow;
uniform float uSpeed;
uniform float uScale;
uniform float uQuality;
uniform float uNoise;
uniform float uNoiseScale;
uniform float uAnimMode;
uniform float uHueShift;
uniform vec2  uResolution;
uniform float uCropMode;

${GLSL_UTILITIES}

${GLSL_WARP_FUNCTIONS}

void main(){
  float t = uTime * uSpeed;
  vec2 baseUV = vUv;
  if(uCropMode > 0.5) baseUV = coverUV(baseUV, uTexSize, uResolution);
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
  gl_FragColor = vec4(col, 1.0);
}`;

export default function LiveShaderView({ item }: { item: CollectionItem }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // A canvas hands back the same context object every time, so a context
    // that was lost earlier stays lost — bail instead of issuing GL calls
    // that would all quietly return null.
    const gl = canvas.getContext("webgl", { antialias: true });
    if (!gl || gl.isContextLost()) return;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERT); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, FRAG); gl.compileShader(fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog); gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      draw();
    };
    img.src = item.dataURL;

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
      cropMode: gl.getUniformLocation(prog, "uCropMode"),
      resolution: gl.getUniformLocation(prog, "uResolution"),
    };

    // animMode 0 is a static gradient — render once instead of running a
    // permanent requestAnimationFrame loop that re-renders an identical frame.
    const animated = item.animMode > 0;
    const t0 = performance.now();
    let animId = 0;
    let running = false;
    let disposed = false;

    function draw() {
      if (disposed) return;
      const t = animated ? (performance.now() - t0) / 1000 : 0;
      gl!.uniform1i(U.tex, 0);
      gl!.uniform2f(U.texSize, item.gridW, item.gridH);
      gl!.uniform1f(U.time, t);
      gl!.uniform1f(U.flow, item.flow);
      gl!.uniform1f(U.speed, item.speed);
      gl!.uniform1f(U.scale, item.scale);
      gl!.uniform1f(U.quality, item.quality);
      gl!.uniform1f(U.noise, item.noise);
      gl!.uniform1f(U.noiseScale, item.noiseScale);
      gl!.uniform1f(U.animMode, item.animMode);
      gl!.uniform1f(U.hueShift, item.hueShift);
      gl!.uniform1f(U.cropMode, 0);
      gl!.uniform2f(U.resolution, gl!.drawingBufferWidth, gl!.drawingBufferHeight);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
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
      gl!.viewport(0, 0, gl!.drawingBufferWidth, gl!.drawingBufferHeight);
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
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // Deliberately NOT calling WEBGL_lose_context.loseContext() here: the
      // canvas would hand the same dead context back to the next effect run
      // (React Strict Mode, Fast Refresh, or an `item` change), and every GL
      // call on it returns null. Dropping the references is enough.
    };
  }, [item]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
    />
  );
}
