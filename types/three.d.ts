// Stand-in so the type checker does not read three.js itself (it ships no types).
// Every three.js value is `any` until we decide to add @types/three.
declare const three: any;
export = three;
