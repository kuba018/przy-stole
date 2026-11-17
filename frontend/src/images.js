// Vite emits content-hashed URLs, so changing a photo invalidates its cache.
const images = import.meta.glob("./assets/images/**/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
});

export function imageUrl(filename) {
  return images[`./assets/images/${filename}`];
}
