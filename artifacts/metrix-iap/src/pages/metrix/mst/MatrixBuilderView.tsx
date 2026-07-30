// Re-export alias — HEAD named the component MatrixBuilderView; the incoming
// branch moved it to MstSprintsView. Tests that still import from this
// path continue to work through this barrel.
export { MstSprintsView as MatrixBuilderView, MatrixGrid } from "./MstSprintsView";
