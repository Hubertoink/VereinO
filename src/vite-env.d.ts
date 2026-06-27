declare module '*.md?raw' {
  const content: string
  export default content
}

declare module '*?url' {
  const url: string
  export default url
}

declare module 'pdfjs-dist/legacy/build/pdf' {
  const pdfjs: any
  export = pdfjs
}
