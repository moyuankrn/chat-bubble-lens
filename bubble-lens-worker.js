let wallpaper = null;

function paint({ rect, wall, radii, blur, veil, bg }) {
  const width = Math.round(rect.width), height = Math.round(rect.height);
  const margin = 18;
  const cover = Math.max(wall.width / wallpaper.width, wall.height / wallpaper.height);
  const imageLeft = wall.left + (wall.width - wallpaper.width * cover) / 2;
  const imageTop = wall.top + (wall.height - wallpaper.height * cover) / 2;
  const source = new OffscreenCanvas(width + margin * 2, height + margin * 2);
  const ctx = source.getContext('2d', { willReadFrequently: true });
  ctx.filter = blur ? `blur(${Math.min(blur, 24)}px)` : 'none';
  ctx.drawImage(wallpaper,
    (rect.left - margin - imageLeft) / cover,
    (rect.top - margin - imageTop) / cover,
    source.width / cover, source.height / cover,
    0, 0, source.width, source.height);
  ctx.filter = 'none';
  ctx.globalAlpha = Math.min(.4, veil / 100);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, source.width, source.height);
  ctx.globalAlpha = 1;
  const pixels = ctx.getImageData(0, 0, source.width, source.height).data;
  const output = new OffscreenCanvas(width, height);
  const out = output.getContext('2d');
  const image = out.createImageData(width, height);
  const radius = radii.map(value => Math.min(value, width / 2, height / 2));
  const sdf = (x, y) => {
    const r = radius[y < height / 2 ? (x < width / 2 ? 0 : 1) : (x < width / 2 ? 3 : 2)];
    const qx = Math.abs(x - width / 2) - (width / 2 - r);
    const qy = Math.abs(y - height / 2) - (height / 2 - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
  // Keep the centre fully transparent even for short, one-line bubbles.
  const band = Math.min(11, height * .3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const depth = -sdf(x + .5, y + .5);
    if (depth <= 0 || depth >= band) continue;
    const nx = sdf(x + 1.5, y + .5) - sdf(x - .5, y + .5);
    const ny = sdf(x + .5, y + 1.5) - sdf(x + .5, y - .5);
    const length = Math.hypot(nx, ny) || 1;
    const t = depth / band;
    const shift = 9 * (1 - t) ** 1.4;
    const sx = Math.max(0, Math.min(source.width - 1, Math.round(x + margin - nx / length * shift)));
    const sy = Math.max(0, Math.min(source.height - 1, Math.round(y + margin - ny / length * shift)));
    const from = (sy * source.width + sx) * 4, to = (y * width + x) * 4;
    image.data[to] = pixels[from];
    image.data[to + 1] = pixels[from + 1];
    image.data[to + 2] = pixels[from + 2];
    image.data[to + 3] = Math.round(pixels[from + 3] * .22 * Math.sin(Math.PI * t));
  }
  out.putImageData(image, 0, 0);
  return output.convertToBlob({ type: 'image/png' });
}

self.onmessage = async ({ data }) => {
  if (data.type === 'source') {
    wallpaper?.close();
    wallpaper = data.bitmap;
    return;
  }
  if (data.type !== 'paint' || !wallpaper) return;
  try {
    const blob = await paint(data);
    self.postMessage({ type: 'paint', id: data.id, generation: data.generation, blob });
  } catch (error) {
    self.postMessage({ type: 'error', id: data.id, generation: data.generation, message: String(error) });
  }
};
