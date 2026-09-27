// Riduce la foto (max 1280 px sul lato lungo) e la converte in JPEG base64
// per inviarla alla funzione IA senza consumare troppa banda.
export async function preparaImmagine(file, lato = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error('Non riesco a leggere questa foto. Prova con un JPG o PNG.'));
      i.src = url;
    });
    const s = Math.min(1, lato / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    const dataUrl = c.toDataURL('image/jpeg', 0.85);
    return { base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}
