import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { idDeYoutube, urlDeReproductor } from '../src/data/youtube.js';

const ID = 'dQw4w9WgXcQ';

test('reconoce las formas comunes de un link de YouTube', () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`,
  ]) assert.equal(idDeYoutube(url), ID, url);
});

test('un host que sólo se parece a YouTube no pasa', () => {
  for (const url of [
    `https://youtube.com.evil.com/watch?v=${ID}`,
    `https://evil.com/youtube.com/watch?v=${ID}`,
    `https://notyoutube.com/watch?v=${ID}`,
    `https://youtu.be.evil.com/${ID}`,
    `https://user@evil.com/@youtube.com/watch?v=${ID}`,
  ]) assert.equal(idDeYoutube(url), null, url);
});

test('el ID tiene que ser de 11 caracteres [A-Za-z0-9_-]: nada se cuela al iframe', () => {
  assert.equal(idDeYoutube('https://www.youtube.com/watch?v=corto'), null);
  assert.equal(idDeYoutube(`https://www.youtube.com/watch?v=${ID}x`), null);
  assert.equal(idDeYoutube('https://www.youtube.com/watch?v="><script>alert(1)</script>'), null);
  assert.equal(idDeYoutube('https://www.youtube.com/watch?v=abc%22onload%3Dx12'), null);
});

test('playlists, canales, la portada y otros esquemas no son un video', () => {
  assert.equal(idDeYoutube('https://www.youtube.com/playlist?list=PL123'), null);
  assert.equal(idDeYoutube('https://www.youtube.com/@canal'), null);
  assert.equal(idDeYoutube('https://www.youtube.com/'), null);
  assert.equal(idDeYoutube(`javascript:alert(1)//youtube.com/watch?v=${ID}`), null);
  assert.equal(idDeYoutube(`ftp://youtube.com/watch?v=${ID}`), null);
});

test('vacío, null y no-strings dan null', () => {
  for (const v of ['', null, undefined, 42, 'no es una url']) assert.equal(idDeYoutube(v), null);
});

test('urlDeReproductor arma el embed sin cookies, o null si no es un video', () => {
  assert.equal(urlDeReproductor(`https://youtu.be/${ID}`), `https://www.youtube-nocookie.com/embed/${ID}?rel=0`);
  assert.equal(urlDeReproductor('https://example.com/video.mp4'), null);
});

test('vercel.json deja embeber youtube-nocookie y sólo eso', () => {
  const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const vercel = JSON.parse(readFileSync(path.join(raiz, 'vercel.json'), 'utf8'));
  const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy').value;
  const frame = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('frame-src '));
  assert.equal(frame, 'frame-src https://www.youtube-nocookie.com');
});
