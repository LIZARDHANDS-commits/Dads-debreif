// A simple helicopter for the SOF 3D view's live traffic (Dad, 8 Oct 2026: "make sure for traffic Helo traffic is a helo"): a round cabin, a tail boom
// with a small fin and tail rotor, skids, and a see-through main rotor disc with a solid rim in the body colour, in plain three.js geometry in the style of ui-kit
// three-aircraft.js's stand-in (flat-shaded, no fog). Kept in the SOF folder because only the SOF draws it.
//
// Frame as the stand-in: nose +X, left +Y, up +Z, about 1.38 long nose to tail rotor (traffic3d.js scales it to its size on the screen) with a rotor
// about 1.24 across. With `tail: false` (a helicopter with no track) only the cabin, skids and rotor are drawn, so no heading is shown that nobody gave.
// Free it with ui-kit `disposeAircraftMesh` (it owns its geometry and materials).

/** The rotor disc's fill and rim opacity, and its radius in the model's units. Estimates for the look. */
const ROTOR = Object.freeze({ radius: 0.62, fill: 0.22, rim: 0.9, height: 0.24 });

/**
 * One helicopter as a THREE.Group. `color` is its body colour and the rotor rim's (traffic3d.js COLOURS), `outline` a colour for the tail fin's edges so it
 * reads against any ground, `tail` false for the tail-less form.
 * @param {any} T three.js
 * @param {{ color: string, outline?: string | null, tail?: boolean }} options
 */
export function createHelicopterMesh(T, { color, outline = null, tail = true }) {
  const base = new T.Color(color);
  const dark = base.clone().multiplyScalar(0.75);
  const group = new T.Group();
  const solid = (c, extra = {}) => new T.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.55, metalness: 0.1, fog: false, ...extra });
  const add = (geometry, material) => {
    const mesh = new T.Mesh(geometry, material);
    group.add(mesh);
    return mesh;
  };

  // Cabin: a stretched ball, a little forward of the rotor mast; a glazed nose.
  const cabin = new T.SphereGeometry(1, 16, 10);
  cabin.scale(0.3, 0.17, 0.16);
  cabin.translate(0.12, 0, 0);
  add(cabin, solid(base));
  const glazing = new T.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  glazing.rotateZ(-Math.PI / 2); // the half ball faces forward
  glazing.scale(0.12, 0.15, 0.13);
  glazing.translate(0.32, 0, 0.02);
  add(glazing, solid('#8fc4ff', { transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.4 }));

  // Skids: two thin rails under the cabin.
  for (const y of [0.13, -0.13]) {
    const skid = new T.BoxGeometry(0.5, 0.025, 0.02);
    skid.translate(0.1, y, -0.2);
    add(skid, solid(dark));
  }

  // Mast and main rotor: a see-through disc with a solid rim and two blades across it.
  const mast = new T.CylinderGeometry(0.025, 0.025, 0.1, 8);
  mast.rotateX(Math.PI / 2);
  mast.translate(0.05, 0, ROTOR.height - 0.05);
  add(mast, solid(dark));
  const disc = new T.CircleGeometry(ROTOR.radius, 40);
  disc.translate(0.05, 0, ROTOR.height);
  const discMesh = add(disc, new T.MeshBasicMaterial({ color: base.clone().lerp(new T.Color('#ffffff'), 0.5), transparent: true, opacity: ROTOR.fill, side: T.DoubleSide, depthWrite: false, fog: false }));
  discMesh.renderOrder = 1;
  const rim = new T.RingGeometry(ROTOR.radius * 0.92, ROTOR.radius, 40);
  rim.translate(0.05, 0, ROTOR.height + 0.002);
  add(rim, new T.MeshBasicMaterial({ color, transparent: true, opacity: ROTOR.rim, side: T.DoubleSide, depthWrite: false, fog: false }));
  for (const turn of [Math.PI / 4, -Math.PI / 4]) {
    const blade = new T.BoxGeometry(ROTOR.radius * 2, 0.04, 0.01);
    blade.rotateZ(turn);
    blade.translate(0.05, 0, ROTOR.height + 0.004);
    add(blade, solid(dark));
  }

  if (tail) {
    // Tail boom: a thin taper from the cabin to the tail, then a small fin and a tail rotor on the left side.
    const boom = new T.CylinderGeometry(0.025, 0.05, 0.7, 10);
    boom.rotateZ(Math.PI / 2); // along X, thin end aft
    boom.translate(-0.48, 0, 0.03);
    add(boom, solid(base));
    const finShape = new T.Shape([new T.Vector2(-0.74, 0.02), new T.Vector2(-0.86, 0.2), new T.Vector2(-0.92, 0.2), new T.Vector2(-0.88, -0.02)]);
    const fin = new T.ExtrudeGeometry(finShape, { depth: 0.014, bevelEnabled: false });
    fin.translate(0, 0, -0.007);
    fin.rotateX(Math.PI / 2);
    add(fin, solid(base.clone().lerp(new T.Color('#ffffff'), 0.15)));
    const tailRotor = new T.CircleGeometry(0.11, 20);
    tailRotor.rotateX(Math.PI / 2); // upright, across the boom
    tailRotor.translate(-0.86, 0.03, 0.08);
    add(tailRotor, new T.MeshBasicMaterial({ color: base.clone().lerp(new T.Color('#ffffff'), 0.5), transparent: true, opacity: 0.4, side: T.DoubleSide, depthWrite: false, fog: false }));
    if (outline) group.add(new T.LineSegments(new T.EdgesGeometry(fin, 30), new T.LineBasicMaterial({ color: outline, fog: false })));
  }
  return group;
}
