// Ambient declarations for asset imports (CSS + static images).
//
// Extension.js ships identical declarations in `extension/types`, but that file
// is a *module* (it ends with `export {}`), so under `moduleResolution: "bundler"`
// its wildcard `declare module "*.css"` entries are not applied to *relative*
// imports like `import "./styles.css"`. Re-declaring them here in a *script*
// (no top-level import/export) makes them globally ambient again, which is what
// bundler resolution consults for relative asset imports. Do not add a top-level
// `export`/`import` to this file or it will stop working.

declare module '*.css' {
  const content: Readonly<Record<string, string>>
  export default content
}
declare module '*.module.css' {
  const content: Readonly<Record<string, string>>
  export default content
}

declare module '*.png' {
  const content: string
  export default content
}
declare module '*.jpg' {
  const content: string
  export default content
}
declare module '*.jpeg' {
  const content: string
  export default content
}
declare module '*.gif' {
  const content: string
  export default content
}
declare module '*.webp' {
  const content: string
  export default content
}
declare module '*.svg' {
  const content: string
  export default content
}
