// Create this file in the same directory as layout.tsx
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}